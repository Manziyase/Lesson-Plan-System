import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { auditFromRequest } from "@/lib/audit";
import {
  badRequest,
  clean,
  included,
  notFound,
  parseDate,
  readBody,
  PAYMENT_STATUSES,
} from "@/lib/platform-utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();
  const { id } = await params;

  const existing = await prisma.paymentRecord.findUnique({ where: { id }, include: { school: true } });
  if (!existing) return notFound("Payment record not found.");

  const body = await readBody(req);
  const data: Prisma.PaymentRecordUncheckedUpdateInput = {};

  if (body.status !== undefined) {
    if (!included(PAYMENT_STATUSES, body.status)) return badRequest("Invalid payment status.");
    data.status = body.status;
    if (body.status === "paid" && !existing.paidAt) data.paidAt = new Date();
  }
  if (body.method !== undefined) data.method = clean(body.method, 40);
  if (body.reference !== undefined) data.reference = clean(body.reference, 120);
  if (body.notes !== undefined) data.notes = clean(body.notes, 400);
  if (body.paidAt !== undefined) data.paidAt = parseDate(body.paidAt);

  if (!Object.keys(data).length) return badRequest("No changes were provided.");

  const payment = await prisma.paymentRecord.update({ where: { id }, data });

  await auditFromRequest(req, admin, {
    action: "payment.update",
    targetType: "payment",
    targetId: id,
    schoolId: existing.schoolId,
    summary: `Updated payment record for ${existing.school.name}: ${existing.status} → ${payment.status}`,
    metadata: { from: existing.status, to: payment.status, reference: payment.reference },
  });

  return Response.json({ payment });
}
