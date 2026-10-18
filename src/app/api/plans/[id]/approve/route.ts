import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/session";
import { approvePlan, planSummary } from "@/lib/plans";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/* POST /api/plans/:id/approve — admin only. Approving a plan publishes its
   lessons school-wide in the Lesson Library (legacy status "published"). */
export async function POST(req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();
  const { id } = await params;
  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan || plan.schoolId !== user.schoolId) {
    return Response.json({ error: "Plan not found." }, { status: 404 });
  }
  await approvePlan(plan.id, user.name);
  const updated = await prisma.plan.findUnique({ where: { id: plan.id }, include: { rows: true } });
  return Response.json({ plan: updated ? planSummary(updated) : null });
}
