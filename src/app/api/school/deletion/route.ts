import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/session";
import { verifyPassword, randomToken } from "@/lib/password";
import { requestMeta } from "@/lib/audit";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403 });
  const request = await prisma.schoolDeletionRequest.findUnique({ where: { schoolId: user.schoolId } });
  return Response.json({ request: request?.cancelledAt || request?.executedAt ? null : request });
}
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 2000) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const schoolName = typeof body.schoolName === "string" ? body.schoolName.trim() : "";
  if (!reason || !password || !schoolName) return Response.json({ error: "School name, explanation, and password confirmation are required." }, { status: 400 });
  const [record, school, existing] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { salt: true, passwordHash: true } }),
    prisma.school.findUnique({ where: { id: user.schoolId } }),
    prisma.schoolDeletionRequest.findUnique({ where: { schoolId: user.schoolId } }),
  ]);
  if (!school || !record) return Response.json({ error: "School not found." }, { status: 404 });
  if (school.name !== schoolName) return Response.json({ error: "Enter the school's full name exactly to confirm." }, { status: 400 });
  if (!verifyPassword(password, record.salt, record.passwordHash)) return Response.json({ error: "Password confirmation failed." }, { status: 403 });
  if (existing && !existing.cancelledAt && !existing.executedAt) return Response.json({ error: "A deletion request is already pending." }, { status: 409 });
  const configured = Number(process.env.SCHOOL_DELETION_GRACE_DAYS ?? 30);
  const graceDays = Number.isInteger(configured) ? Math.max(7, Math.min(configured, 180)) : 30;
  const scheduledFor = new Date(Date.now() + graceDays * 86400000);
  const data = { id: `del_${randomToken()}`, schoolId: school.id, schoolName: school.name, requestedById: user.id, requestedByName: user.name, requestedByType: "school_user", confirmedById: user.id, confirmedByName: user.name, reason, graceDays, scheduledFor, requestedAt: new Date(), cancelledAt: null, executedAt: null };
  const deletion = existing
    ? await prisma.schoolDeletionRequest.update({ where: { schoolId: school.id }, data })
    : await prisma.schoolDeletionRequest.create({ data });
  const meta = requestMeta(req);
  await prisma.auditLog.create({ data: { id: `log_${randomToken()}`, actorType: "school_user", actorId: user.id, actorName: user.name, actorEmail: user.email, action: "school.deletion_requested", targetType: "school", targetId: school.id, schoolId: school.id, summary: `School deletion requested: ${school.name}`, metadata: JSON.stringify({ reason, scheduledFor: scheduledFor.toISOString(), graceDays }), ip: meta.ip, userAgent: meta.userAgent } });
  return Response.json({ request: deletion }, { status: 201 });
}
export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403 });
  const request = await prisma.schoolDeletionRequest.findUnique({ where: { schoolId: user.schoolId } });
  if (!request || request.cancelledAt || request.executedAt) return Response.json({ error: "No pending deletion request." }, { status: 404 });
  await prisma.schoolDeletionRequest.update({ where: { id: request.id }, data: { cancelledAt: new Date() } });
  const meta = requestMeta(req);
  await prisma.auditLog.create({ data: { id: `log_${randomToken()}`, actorType: "school_user", actorId: user.id, actorName: user.name, actorEmail: user.email, action: "school.deletion_cancelled", targetType: "school", targetId: user.schoolId, schoolId: user.schoolId, summary: `Pending deletion cancelled: ${request.schoolName}`, ip: meta.ip, userAgent: meta.userAgent } });
  return Response.json({ ok: true });
}
