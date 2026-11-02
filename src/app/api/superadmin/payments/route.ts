import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { auditFromRequest } from "@/lib/audit";
import {
  badRequest,
  clean,
  included,
  parseDate,
  readBody,
  toInt,
  PAYMENT_STATUSES,
} from "@/lib/platform-utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();

  const url = new URL(req.url);
  const q = clean(url.searchParams.get("q"), 120);
  const schoolId = clean(url.searchParams.get("schoolId"), 80);
  const status = url.searchParams.get("status") ?? "";
  const method = clean(url.searchParams.get("method"), 40);
  const page = toInt(url.searchParams.get("page"), 1, 1, 10_000);
  const pageSize = toInt(url.searchParams.get("pageSize"), 25, 1, 100);
  const since30 = new Date(Date.now() - 30 * 86_400_000);

  const where: Prisma.PaymentRecordWhereInput = {};
  if (q) {
    where.OR = [
      { reference: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } },
      { school: { name: { contains: q, mode: "insensitive" } } },
      { school: { code: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (schoolId) where.schoolId = schoolId;
  if (included(PAYMENT_STATUSES, status)) where.status = status;
  if (method) where.method = method;

  const [total, rows, paidAll, paid30] = await Promise.all([
    prisma.paymentRecord.count({ where }),
    prisma.paymentRecord.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        school: { select: { id: true, name: true, code: true } },
        subscription: {
          select: { id: true, status: true, billingCycle: true, plan: { select: { name: true } } },
        },
      },
    }),
    prisma.paymentRecord.aggregate({ where: { status: "paid" }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.paymentRecord.aggregate({
      where: { status: "paid", paidAt: { gte: since30 } },
      _sum: { amount: true },
    }),
  ]);

  return Response.json(
    {
      payments: rows,
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      summary: {
        totalPaid: paidAll._sum.amount ?? 0,
        paidRecords: paidAll._count._all,
        paidLast30Days: paid30._sum.amount ?? 0,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** Record an actual payment that was received outside the platform. */
export async function POST(req: Request) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();

  const body = await readBody(req);
  const schoolId = clean(body.schoolId, 80);
  const subscriptionId = clean(body.subscriptionId, 80) || null;
  const amount = toInt(body.amount, 0, 0, 1_000_000_000);
  const status = clean(body.status, 20) || "paid";
  const method = clean(body.method, 40);

  if (!schoolId) return badRequest("Please choose a school.");
  if (amount <= 0) return badRequest("Enter the amount that was actually received.");
  if (!included(PAYMENT_STATUSES, status)) return badRequest("Invalid payment status.");

  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) return badRequest("School not found.");
  if (subscriptionId) {
    const sub = await prisma.schoolSubscription.findUnique({ where: { id: subscriptionId } });
    if (!sub || sub.schoolId !== schoolId) return badRequest("Subscription does not belong to this school.");
  }

  const paidAt = parseDate(body.paidAt) ?? (status === "paid" ? new Date() : null);

  const payment = await prisma.paymentRecord.create({
    data: {
      id: "pay_" + crypto.randomUUID().slice(0, 14),
      schoolId,
      subscriptionId,
      amount,
      currency: clean(body.currency, 8).toUpperCase() || "RWF",
      status,
      method,
      reference: clean(body.reference, 120),
      paidAt,
      notes: clean(body.notes, 400),
      recordedBy: admin.id,
    },
    include: {
      school: { select: { id: true, name: true, code: true } },
      subscription: {
        select: { id: true, status: true, billingCycle: true, plan: { select: { name: true } } },
      },
    },
  });

  await auditFromRequest(req, admin, {
    action: "payment.record",
    targetType: "payment",
    targetId: payment.id,
    schoolId,
    summary: `Recorded ${status} payment of ${amount} ${payment.currency} for ${school.name}`,
    metadata: { amount, currency: payment.currency, status, method, reference: payment.reference },
  });

  return Response.json({ payment }, { status: 201 });
}
