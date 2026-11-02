import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { auditFromRequest } from "@/lib/audit";
import {
  badRequest,
  clean,
  notFound,
  parseStringArray,
  readBody,
  toBool,
  toInt,
} from "@/lib/platform-utils";
import { planJson } from "@/lib/platform-serializers";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();
  const { id } = await params;

  const existing = await prisma.subscriptionPlan.findUnique({ where: { id } });
  if (!existing) return notFound("Subscription plan not found.");

  const body = await readBody(req);
  const data: Prisma.SubscriptionPlanUncheckedUpdateInput = {};

  if (body.name !== undefined) {
    const name = clean(body.name, 80);
    if (!name) return badRequest("Plan name is required.");
    data.name = name;
  }
  if (body.description !== undefined) data.description = clean(body.description, 400);
  if (body.monthlyPrice !== undefined) data.monthlyPrice = toInt(body.monthlyPrice, 0, 0, 1_000_000_000);
  if (body.annualPrice !== undefined) data.annualPrice = toInt(body.annualPrice, 0, 0, 10_000_000_000);
  if (body.currency !== undefined) data.currency = clean(body.currency, 8).toUpperCase() || "RWF";
  const limit = (v: unknown) => (v === null || v === "" ? null : toInt(v, 0, 0, 10_000_000));
  if (body.maxTeachers !== undefined) data.maxTeachers = limit(body.maxTeachers);
  if (body.maxUsers !== undefined) data.maxUsers = limit(body.maxUsers);
  if (body.maxClasses !== undefined) data.maxClasses = limit(body.maxClasses);
  if (body.maxStorageMb !== undefined) data.maxStorageMb = limit(body.maxStorageMb);
  if (body.features !== undefined) data.features = JSON.stringify(parseStringArray(body.features, 20, 140));
  if (body.isActive !== undefined) data.isActive = toBool(body.isActive, existing.isActive);
  if (body.sortOrder !== undefined) data.sortOrder = toInt(body.sortOrder, existing.sortOrder, 0, 999);

  if (body.isDefault !== undefined) {
    const makeDefault = toBool(body.isDefault, false);
    data.isDefault = makeDefault;
    if (makeDefault) {
      await prisma.subscriptionPlan.updateMany({
        where: { id: { not: id } },
        data: { isDefault: false },
      });
    }
  }

  if (!Object.keys(data).length) return badRequest("No changes were provided.");

  const plan = await prisma.subscriptionPlan.update({
    where: { id },
    data,
    include: { _count: { select: { subscriptions: true } } },
  });

  await auditFromRequest(req, admin, {
    action: "plan.update",
    targetType: "subscription_plan",
    targetId: id,
    summary: `Updated subscription plan ${plan.name} (${plan.code})`,
    metadata: { changed: Object.keys(data) },
  });

  return Response.json({ plan: planJson(plan) });
}
