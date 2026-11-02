import { prisma } from "@/lib/db";
import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { auditFromRequest } from "@/lib/audit";
import { badRequest, clean, included, notFound, readBody, USER_STATUSES } from "@/lib/platform-utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();
  const { id } = await params;

  const target = await prisma.platformAdmin.findUnique({ where: { id } });
  if (!target) return notFound("Super admin not found.");

  const body = await readBody(req);
  const status = clean(body.status, 20);
  if (!included(USER_STATUSES, status)) return badRequest("Invalid account status.");

  if (target.id === admin.id) {
    return badRequest("You cannot change the status of your own account.");
  }
  if (status === "disabled") {
    const active = await prisma.platformAdmin.count({
      where: { status: "active", id: { not: target.id } },
    });
    if (active === 0) return badRequest("At least one active super admin must remain.");
  }
  if (status === target.status) return badRequest(`This account is already ${status}.`);

  const updated = await prisma.platformAdmin.update({
    where: { id },
    data: { status },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      mfaEnabled: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  let revokedSessions = 0;
  if (status === "disabled") {
    const result = await prisma.platformSession.deleteMany({ where: { adminId: id } });
    revokedSessions = result.count;
  }

  await auditFromRequest(req, admin, {
    action: status === "disabled" ? "platform_admin.disable" : "platform_admin.reactivate",
    targetType: "platform_admin",
    targetId: id,
    summary: `${status === "disabled" ? "Disabled" : "Reactivated"} super admin ${target.name} (${target.email})`,
    metadata: { from: target.status, to: status, revokedSessions },
  });

  return Response.json({ admin: updated, revokedSessions });
}
