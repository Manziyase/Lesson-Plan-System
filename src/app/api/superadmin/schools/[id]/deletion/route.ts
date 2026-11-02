import { prisma } from "@/lib/db";
import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { randomToken } from "@/lib/password";
import { auditFromRequest } from "@/lib/audit";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();
  const { id } = await params;
  const request = await prisma.schoolDeletionRequest.findUnique({ where: { schoolId: id } });
  return Response.json({ request: request?.cancelledAt || request?.executedAt ? null : request });
}
export async function POST(req: Request, { params }: Params) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();
  const { id } = await params;
  const school = await prisma.school.findUnique({ where: { id } });
  if (!school) return Response.json({ error: "School not found." }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 2000) : "";
  if (!reason || body.schoolName !== school.name) return Response.json({ error: "Provide a reason and enter the school's full name exactly." }, { status: 400 });
  const existing = await prisma.schoolDeletionRequest.findUnique({ where: { schoolId: id } });
  if (existing && !existing.cancelledAt && !existing.executedAt) return Response.json({ error: "A deletion request is already pending." }, { status: 409 });
  const configured = Number(process.env.SCHOOL_DELETION_GRACE_DAYS ?? 30);
  const graceDays = Number.isInteger(configured) ? Math.max(7, Math.min(configured, 180)) : 30;
  const scheduledFor = new Date(Date.now() + graceDays * 86400000);
  const data = { id: `del_${randomToken()}`, schoolId: id, schoolName: school.name, requestedById: admin.id, requestedByName: admin.name, requestedByType: "platform_admin", confirmedById: admin.id, confirmedByName: admin.name, reason, graceDays, scheduledFor, requestedAt: new Date(), cancelledAt: null, executedAt: null };
  const deletion = existing
    ? await prisma.schoolDeletionRequest.update({ where: { schoolId: id }, data })
    : await prisma.schoolDeletionRequest.create({ data });
  await auditFromRequest(req, admin, { action: "school.deletion_requested", targetType: "school", targetId: id, schoolId: id, summary: `Permanent deletion scheduled for ${school.name}`, metadata: { reason, graceDays, scheduledFor: scheduledFor.toISOString() } });
  return Response.json({ request: deletion }, { status: 201 });
}
export async function DELETE(req: Request, { params }: Params) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();
  const { id } = await params;
  const request = await prisma.schoolDeletionRequest.findUnique({ where: { schoolId: id } });
  if (!request || request.cancelledAt || request.executedAt) return Response.json({ error: "No pending deletion request." }, { status: 404 });
  await prisma.schoolDeletionRequest.update({ where: { id: request.id }, data: { cancelledAt: new Date() } });
  await auditFromRequest(req, admin, { action: "school.deletion_cancelled", targetType: "school", targetId: id, schoolId: id, summary: `Pending deletion cancelled for ${request.schoolName}` });
  return Response.json({ ok: true });
}
export async function PUT(req: Request, { params }: Params) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();
  const { id } = await params;
  const request = await prisma.schoolDeletionRequest.findUnique({ where: { schoolId: id } });
  if (!request || request.cancelledAt || request.executedAt) return Response.json({ error: "No pending deletion request." }, { status: 404 });
  let schoolName = "";
  try { schoolName = String((await req.json()).schoolName ?? "").trim(); } catch { /* invalid */ }
  if (schoolName !== request.schoolName) return Response.json({ error: "Enter the school's full name exactly to confirm." }, { status: 400 });
  if (Date.now() < request.scheduledFor.getTime()) return Response.json({ error: "The configured grace period has not elapsed." }, { status: 409 });
  const meta = { actorType: "platform_admin", actorId: admin.id, actorName: admin.name, actorEmail: admin.email, action: "school.deleted", targetType: "school", targetId: id, schoolId: id, summary: `Permanently deleted school: ${request.schoolName}`, metadata: JSON.stringify({ requestedById: request.requestedById, requestedByName: request.requestedByName, confirmedById: admin.id, confirmedByName: admin.name, requestedAt: request.requestedAt.toISOString(), executedAt: new Date().toISOString(), reason: request.reason }) };
  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({ data: { id: `log_${randomToken()}`, ...meta } });
    await tx.school.delete({ where: { id } });
  });
  return Response.json({ ok: true, deletedSchool: request.schoolName });
}
