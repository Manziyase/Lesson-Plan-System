import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { auditFromRequest } from "@/lib/audit";
import {
  badRequest,
  clean,
  included,
  notFound,
  parseDateOnly,
  readBody,
  BILLING_CYCLES,
  SUBSCRIPTION_STATUSES,
} from "@/lib/platform-utils";
import { planJson } from "@/lib/platform-serializers";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const ACTION: Record<string, string> = {
  cancelled: "subscription.cancel",
  suspended: "subscription.suspend",
  expired: "subscription.expire",
  active: "subscription.activate",
  trial: "subscription.update",
};

export async function PATCH(req: Request, { params }: Params) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();
  const { id } = await params;

  const existing = await prisma.schoolSubscription.findUnique({
    where: { id },
    include: { school: { select: { id: true, name: true } }, plan: true },
  });
  if (!existing) return notFound("Subscription not found.");

  const body = await readBody(req);
  const data: Prisma.SchoolSubscriptionUncheckedUpdateInput = {};

  if (body.planId !== undefined) {
    const planId = clean(body.planId, 80);
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) return badRequest("Plan not found.");
    data.planId = planId;
  }
  if (body.billingCycle !== undefined) {
    if (!included(BILLING_CYCLES, body.billingCycle)) return badRequest("Invalid billing cycle.");
    data.billingCycle = body.billingCycle;
  }
  if (body.status !== undefined) {
    if (!included(SUBSCRIPTION_STATUSES, body.status)) return badRequest("Invalid subscription status.");
    data.status = body.status;
    if (body.status === "cancelled" && existing.status !== "cancelled") {
      data.cancelledAt = new Date();
    }
    if (body.status !== "cancelled") data.cancelledAt = null;
  }
  if (body.startDate !== undefined) {
    const startDate = parseDateOnly(body.startDate);
    if (!startDate) return badRequest("Invalid start date.");
    data.startDate = startDate;
  }
  if (body.renewsAt !== undefined) data.renewsAt = parseDateOnly(body.renewsAt);
  if (body.endsAt !== undefined) data.endsAt = parseDateOnly(body.endsAt);
  if (body.notes !== undefined) data.notes = clean(body.notes, 400);

  if (!Object.keys(data).length) return badRequest("No changes were provided.");

  const nextStatus = (data.status as string | undefined) ?? existing.status;
  if (nextStatus === "trial" || nextStatus === "active") {
    await prisma.schoolSubscription.updateMany({
      where: {
        schoolId: existing.schoolId,
        id: { not: id },
        status: { in: ["trial", "active"] },
      },
      data: { status: "cancelled", cancelledAt: new Date() },
    });
  }

  const subscription = await prisma.schoolSubscription.update({
    where: { id },
    data,
    include: {
      school: { select: { id: true, name: true, code: true, status: true, district: true } },
      plan: true,
      _count: { select: { payments: true } },
    },
  });

  await auditFromRequest(req, admin, {
    action: ACTION[nextStatus] ?? "subscription.update",
    targetType: "school_subscription",
    targetId: id,
    schoolId: existing.schoolId,
    summary: `Updated subscription for ${existing.school.name} — ${existing.status} → ${nextStatus}`,
    metadata: {
      from: existing.status,
      to: nextStatus,
      plan: subscription.plan.name,
      billingCycle: subscription.billingCycle,
    },
  });

  return Response.json({
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
      plan: planJson(subscription.plan),
      payments: subscription._count.payments,
    },
  });
}
