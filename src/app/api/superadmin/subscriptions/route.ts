import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { ensureDefaultPlans, dateOnly } from "@/lib/platform";
import { auditFromRequest } from "@/lib/audit";
import {
  badRequest,
  clean,
  included,
  parseDateOnly,
  readBody,
  toInt,
  BILLING_CYCLES,
  SUBSCRIPTION_STATUSES,
} from "@/lib/platform-utils";
import { planJson } from "@/lib/platform-serializers";

export const dynamic = "force-dynamic";

const PLAN_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  monthlyPrice: true,
  annualPrice: true,
  currency: true,
  maxTeachers: true,
  maxUsers: true,
  maxClasses: true,
  maxStorageMb: true,
  features: true,
  isActive: true,
  isDefault: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function GET(req: Request) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();
  await ensureDefaultPlans().catch(() => {});

  const url = new URL(req.url);
  const q = clean(url.searchParams.get("q"), 120);
  const status = url.searchParams.get("status") ?? "";
  const planId = clean(url.searchParams.get("planId"), 80);
  const schoolId = clean(url.searchParams.get("schoolId"), 80);
  const cycle = url.searchParams.get("cycle") ?? "";
  const page = toInt(url.searchParams.get("page"), 1, 1, 10_000);
  const pageSize = toInt(url.searchParams.get("pageSize"), 25, 1, 100);

  const where: Prisma.SchoolSubscriptionWhereInput = {};
  if (q) {
    where.school = {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
        { district: { contains: q, mode: "insensitive" } },
      ],
    };
  }
  if (included(SUBSCRIPTION_STATUSES, status)) where.status = status;
  if (planId) where.planId = planId;
  if (schoolId) where.schoolId = schoolId;
  if (included(BILLING_CYCLES, cycle)) where.billingCycle = cycle;

  const [
    total,
    rows,
    statusRows,
    plans,
    schools,
    revenue,
    planDist,
  ] = await Promise.all([
    prisma.schoolSubscription.count({ where }),
    prisma.schoolSubscription.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        school: { select: { id: true, name: true, code: true, status: true, district: true } },
        plan: { select: PLAN_SELECT },
        _count: { select: { payments: true } },
      },
    }),
    prisma.schoolSubscription.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.subscriptionPlan.findMany({
      orderBy: [{ sortOrder: "asc" }, { monthlyPrice: "asc" }],
      include: { _count: { select: { subscriptions: true } } },
    }),
    prisma.school.findMany({
      select: { id: true, name: true, code: true, status: true },
      orderBy: { name: "asc" },
      take: 1000,
    }),
    prisma.paymentRecord.aggregate({ where: { status: "paid" }, _sum: { amount: true } }),
    prisma.schoolSubscription.groupBy({ by: ["planId"], _count: { _all: true } }),
  ]);

  const counts: Record<string, number> = {};
  for (const r of statusRows) counts[r.status] = r._count._all;

  return Response.json(
    {
      subscriptions: rows.map((s) => ({
        id: s.id,
        status: s.status,
        billingCycle: s.billingCycle,
        startDate: s.startDate,
        renewsAt: s.renewsAt,
        endsAt: s.endsAt,
        cancelledAt: s.cancelledAt,
        notes: s.notes,
        createdAt: s.createdAt,
        school: s.school,
        plan: planJson(s.plan as Parameters<typeof planJson>[0]),
        payments: s._count.payments,
      })),
      plans: plans.map(planJson),
      schools,
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      counts,
      planDistribution: planDist.map((r) => ({
        planId: r.planId,
        count: r._count._all,
        name: plans.find((p) => p.id === r.planId)?.name ?? "Unknown",
      })),
      revenue: { totalPaid: revenue._sum.amount ?? 0 },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();

  const body = await readBody(req);
  const schoolId = clean(body.schoolId, 80);
  const planId = clean(body.planId, 80);
  const status = clean(body.status, 20) || "active";
  const billingCycle = clean(body.billingCycle, 20) || "monthly";

  if (!schoolId) return badRequest("Please choose a school.");
  if (!planId) return badRequest("Please choose a subscription plan.");
  if (!included(SUBSCRIPTION_STATUSES, status)) return badRequest("Invalid subscription status.");
  if (!included(BILLING_CYCLES, billingCycle)) return badRequest("Invalid billing cycle.");

  const [school, plan] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId } }),
    prisma.subscriptionPlan.findUnique({ where: { id: planId } }),
  ]);
  if (!school) return badRequest("School not found.");
  if (!plan) return badRequest("Plan not found.");

  const startDate = parseDateOnly(body.startDate) || dateOnly();
  const renewsAt = parseDateOnly(body.renewsAt);
  const endsAt = parseDateOnly(body.endsAt);
  const notes = clean(body.notes, 400);

  if (status === "trial" || status === "active") {
    await prisma.schoolSubscription.updateMany({
      where: { schoolId, id: { not: "" }, status: { in: ["trial", "active"] } },
      data: { status: "cancelled", cancelledAt: new Date() },
    });
  }

  const subscription = await prisma.schoolSubscription.create({
    data: {
      id: "sub_" + crypto.randomUUID().slice(0, 14),
      schoolId,
      planId,
      status,
      billingCycle,
      startDate,
      renewsAt,
      endsAt,
      notes,
      cancelledAt: status === "cancelled" ? new Date() : null,
    },
    include: {
      school: { select: { id: true, name: true, code: true, status: true, district: true } },
      plan: { select: PLAN_SELECT },
      _count: { select: { payments: true } },
    },
  });

  await auditFromRequest(req, admin, {
    action: "subscription.create",
    targetType: "school_subscription",
    targetId: subscription.id,
    schoolId,
    summary: `Assigned ${plan.name} (${billingCycle}) to ${school.name} — ${status}`,
    metadata: { planId, plan: plan.name, status, billingCycle, startDate, renewsAt, endsAt },
  });

  return Response.json(
    {
      subscription: {
        id: subscription.id,
        status: subscription.status,
        billingCycle: subscription.billingCycle,
        startDate: subscription.startDate,
        renewsAt: subscription.renewsAt,
        endsAt: subscription.endsAt,
        cancelledAt: subscription.cancelledAt,
        notes: subscription.notes,
        createdAt: subscription.createdAt,
        school: subscription.school,
        plan: planJson(subscription.plan as Parameters<typeof planJson>[0]),
        payments: subscription._count.payments,
      },
    },
    { status: 201 }
  );
}
