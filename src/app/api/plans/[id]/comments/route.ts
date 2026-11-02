import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/session";
import { randomToken } from "@/lib/password";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const plan = await prisma.plan.findFirst({ where: { id, schoolId: user.schoolId } });
  if (!plan || (user.role !== "admin" && plan.status !== "published" && plan.teacherId !== user.id)) return Response.json({ error: "Plan not found." }, { status: 404 });
  const comments = await prisma.planComment.findMany({ where: { planId: id, schoolId: user.schoolId }, include: { author: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: "asc" } });
  return Response.json({ comments });
}

export async function POST(req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const plan = await prisma.plan.findFirst({ where: { id, schoolId: user.schoolId } });
  if (!plan || (user.role !== "admin" && plan.status !== "published" && plan.teacherId !== user.id)) return Response.json({ error: "Plan not found." }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid comment." }, { status: 400 }); }
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 5000) : "";
  const kind = body.kind === "feedback" ? "feedback" : "comment";
  const parentId = typeof body.parentId === "string" ? body.parentId : null;
  if (!text) return Response.json({ error: "Write a comment first." }, { status: 400 });
  if (kind === "feedback" && user.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403 });
  let parentAuthorId = "";
  if (parentId) {
    const parent = await prisma.planComment.findFirst({ where: { id: parentId, planId: id, schoolId: user.schoolId } });
    if (!parent) return Response.json({ error: "Parent comment not found." }, { status: 404 });
    parentAuthorId = parent.authorId;
  }
  const comment = await prisma.planComment.create({ data: { id: `cmt_${randomToken()}`, planId: id, schoolId: user.schoolId, authorId: user.id, parentId, kind, body: text } });
  if (kind === "feedback") {
    await prisma.notification.create({ data: { id: `ntf_${randomToken()}`, schoolId: user.schoolId, userId: plan.teacherId, kind: "lesson_feedback", targetId: id, body: text.slice(0, 180) } });
  } else if (parentAuthorId && parentAuthorId !== user.id) {
    await prisma.notification.create({ data: { id: `ntf_${randomToken()}`, schoolId: user.schoolId, userId: parentAuthorId, kind: "lesson_comment_reply", targetId: id, body: text.slice(0, 180) } });
  } else if (plan.teacherId !== user.id) {
    await prisma.notification.create({ data: { id: `ntf_${randomToken()}`, schoolId: user.schoolId, userId: plan.teacherId, kind: "lesson_comment", targetId: id, body: text.slice(0, 180) } });
  }
  return Response.json({ comment }, { status: 201 });
}
