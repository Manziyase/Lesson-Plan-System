import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/session";
import { approvePlan, planSummary } from "@/lib/plans";
import { randomToken } from "@/lib/password";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/* POST /api/plans/:id/approve — admin only. Approving a plan publishes its
   lessons school-wide in the Lesson Library (legacy status "published").
   Accepts optional { feedback: string } attached to the plan record. */
export async function POST(req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();
  const { id } = await params;
  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan || plan.schoolId !== user.schoolId) {
    return Response.json({ error: "Plan not found." }, { status: 404 });
  }
  let feedback = "";
  let action = "approve";
  try {
    const body = await req.json();
    feedback = typeof body.feedback === "string" ? body.feedback.slice(0, 2000) : "";
    action = body.action === "revision" ? "revision" : "approve";
  } catch {
    /* no body = no feedback */
  }
  if (action === "revision") {
    if (!feedback.trim()) return Response.json({ error: "Add feedback explaining what needs revision." }, { status: 400 });
    await prisma.plan.update({ where: { id: plan.id }, data: { status: "pending", approvedByName: "", approvedAt: null, feedback } });
    await prisma.lesson.updateMany({ where: { planId: plan.id }, data: { status: "pending" } });
    await prisma.planComment.create({ data: { id: `cmt_${randomToken()}`, planId: plan.id, schoolId: user.schoolId, authorId: user.id, kind: "feedback", body: feedback } });
    await prisma.notification.create({ data: { id: `ntf_${randomToken()}`, schoolId: user.schoolId, userId: plan.teacherId, kind: "lesson_revision", targetId: plan.id, body: feedback.slice(0, 180) } });
  } else {
    await approvePlan(plan.id, user.name, feedback);
    if (feedback.trim()) {
      await prisma.planComment.create({ data: { id: `cmt_${randomToken()}`, planId: plan.id, schoolId: user.schoolId, authorId: user.id, kind: "feedback", body: feedback } });
      await prisma.notification.create({ data: { id: `ntf_${randomToken()}`, schoolId: user.schoolId, userId: plan.teacherId, kind: "lesson_feedback", targetId: plan.id, body: feedback.slice(0, 180) } });
    }
  }
  const updated = await prisma.plan.findUnique({ where: { id: plan.id }, include: { rows: true } });
  return Response.json({ plan: updated ? planSummary(updated) : null });
}
