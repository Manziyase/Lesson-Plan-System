import { prisma } from "@/lib/db";
import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { auditFromRequest } from "@/lib/audit";
import {
  badRequest,
  clean,
  included,
  notFound,
  readBody,
  USER_STATUSES,
} from "@/lib/platform-utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();
  const { id } = await params;

  const user = await prisma.user.findUnique({ where: { id }, include: { school: true } });
  if (!user) return notFound("User not found.");

  const body = await readBody(req);
  const status = clean(body.status, 20);
  const reason = clean(body.reason, 300);
  if (!included(USER_STATUSES, status)) return badRequest("Invalid account status.");
  if (status === user.status) return badRequest(`This account is already ${status}.`);
  if (status === "disabled" && !reason) {
    return badRequest("Please provide a reason for disabling this account.");
  }

  /* Never leave a school without an active administrator. */
  if (status === "disabled" && user.role === "admin") {
    const otherAdmins = await prisma.user.count({
      where: { schoolId: user.schoolId, role: "admin", status: "active", NOT: { id: user.id } },
    });
    if (otherAdmins === 0) {
      return badRequest(
        "This is the school's last active administrator. Promote or create another administrator first."
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      status,
      statusReason: status === "disabled" ? reason : "",
      disabledAt: status === "disabled" ? new Date() : null,
    },
  });

  let revokedSessions = 0;
  if (status === "disabled") {
    const result = await prisma.session.deleteMany({ where: { userId: id } });
    revokedSessions = result.count;
  }

  await auditFromRequest(req, admin, {
    action: status === "disabled" ? "user.disable" : "user.reactivate",
    targetType: "user",
    targetId: id,
    schoolId: user.schoolId,
    summary: `${status === "disabled" ? "Disabled" : "Reactivated"} ${user.role} ${user.name} (${
      user.email
    })${status === "disabled" ? `: ${reason}` : ""}`,
    metadata: {
      from: user.status,
      to: status,
      reason,
      revokedSessions,
      schoolName: user.school.name,
    },
  });

  return Response.json({
    ok: true,
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      status: updated.status,
      statusReason: updated.statusReason,
      disabledAt: updated.disabledAt,
      schoolId: updated.schoolId,
    },
    revokedSessions,
  });
}
