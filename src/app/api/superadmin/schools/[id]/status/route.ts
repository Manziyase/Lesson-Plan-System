import { prisma } from "@/lib/db";
import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { assignDefaultSubscription } from "@/lib/platform";
import { auditFromRequest } from "@/lib/audit";
import {
  badRequest,
  clean,
  included,
  notFound,
  readBody,
  SCHOOL_STATUSES,
} from "@/lib/platform-utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const ACTION: Record<string, string> = {
  active: "school.activate",
  suspended: "school.suspend",
  deactivated: "school.deactivate",
};

const LABEL: Record<string, string> = {
  active: "reactivated",
  suspended: "suspended",
  deactivated: "deactivated",
};

/** Change a school workspace status and revoke tenant sessions when blocked. */
export async function POST(req: Request, { params }: Params) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();
  const { id } = await params;

  const school = await prisma.school.findUnique({ where: { id } });
  if (!school) return notFound("School not found.");

  const body = await readBody(req);
  const status = clean(body.status, 20);
  const reason = clean(body.reason, 300);

  if (!included(SCHOOL_STATUSES, status)) return badRequest("Invalid school status.");
  if (status === "pending") {
    return badRequest("Pending is an automatic registration state and cannot be selected manually.");
  }
  if (status === school.status) return badRequest(`This school is already ${status}.`);
  if (status !== "active" && !reason) {
    return badRequest("Please provide a reason for suspending or deactivating this school.");
  }

  const updated = await prisma.school.update({
    where: { id },
    data: {
      status,
      statusReason: status === "active" ? "" : reason,
      statusChangedAt: new Date(),
    },
  });

  let revokedSessions = 0;
  if (status !== "active") {
    const result = await prisma.session.deleteMany({ where: { user: { schoolId: id } } });
    revokedSessions = result.count;
  } else if (school.status === "pending") {
    /* Registration deliberately skips the trial until approval. */
    await assignDefaultSubscription(id, { name: admin.name, email: admin.email });
  }

  await auditFromRequest(req, admin, {
    action: ACTION[status],
    targetType: "school",
    targetId: id,
    schoolId: id,
    summary: `School ${school.name} ${LABEL[status]}${reason && status !== "active" ? `: ${reason}` : ""}`,
    metadata: { from: school.status, to: status, reason, revokedSessions },
  });

  return Response.json({
    ok: true,
    status: updated.status,
    statusReason: updated.statusReason,
    statusChangedAt: updated.statusChangedAt,
    revokedSessions,
  });
}
