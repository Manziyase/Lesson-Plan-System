import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { ensureDefaultPlans } from "@/lib/platform";
import { auditFromRequest } from "@/lib/audit";
import {
  badRequest,
  clean,
  parseStringArray,
  readBody,
  toBool,
  toInt,
} from "@/lib/platform-utils";
import { planJson } from "@/lib/platform-serializers";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();
  await ensureDefaultPlans();
  const plans = await prisma.subscriptionPlan.findMany({
    orderBy: [{ sortOrder: "asc" }, { monthlyPrice: "asc" }],
    include: { _count: { select: { subscriptions: true } } },
  });
  return Response.json(
    { plans: plans.map(planJson) },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();

  const body = await readBody(req);
  const code = clean(body.code, 40).toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const name = clean(body.name, 80);
  if (!code) return badRequest("A plan code is required (letters, numbers, - or _).");
  if (!name) return badRequest("A plan name is required.");

  const existing = await prisma.subscriptionPlan.findUnique({ where: { code } });
  if (existing) return badRequest("A plan with this code already exists.");

  const isDefault = toBool(body.isDefault, false);
  const features = parseStringArray(body.features, 20, 140);
  const optionalLimit = (v: unknown) =>
    v === null || v === undefined || v === "" ? null : toInt(v, 0, 0, 10_000_000);

  const createData: Prisma.SubscriptionPlanUncheckedCreateInput = {
    id: "plan_" + crypto.randomUUID().slice(0, 12),
    code,
    name,
    description: clean(body.description, 400),
    monthlyPrice: toInt(body.monthlyPrice, 0, 0, 1_000_000_000),
    annualPrice: toInt(body.annualPrice, 0, 0, 10_000_000_000),
    currency: clean(body.currency, 8).toUpperCase() || "RWF",
    maxTeachers: optionalLimit(body.maxTeachers),
    maxUsers: optionalLimit(body.maxUsers),
    maxClasses: optionalLimit(body.maxClasses),
    maxStorageMb: optionalLimit(body.maxStorageMb),
    features: JSON.stringify(features),
    isActive: toBool(body.isActive, true),
    isDefault,
    sortOrder: toInt(body.sortOrder, 99, 0, 999),
  };

  if (isDefault) {
    await prisma.subscriptionPlan.updateMany({ data: { isDefault: false } });
  }
  const plan = await prisma.subscriptionPlan.create({ data: createData });

  await auditFromRequest(req, admin, {
    action: "plan.create",
    targetType: "subscription_plan",
    targetId: plan.id,
    summary: `Created subscription plan ${plan.name} (${plan.code})`,
    metadata: { code: plan.code, monthlyPrice: plan.monthlyPrice, annualPrice: plan.annualPrice },
  });

  return Response.json({ plan: planJson(plan) }, { status: 201 });
}
