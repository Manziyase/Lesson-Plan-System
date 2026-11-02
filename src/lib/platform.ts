/*
 * Platform (SaaS) configuration, default subscription plans and tenant
 * subscription helpers. Platform settings are stored as one JSON document
 * under the "platform" key; only non-secret operational configuration lives
 * here (SMTP passwords / API keys must come from environment variables).
 */

import { prisma } from "./db";
import { randomToken } from "./password";

export type PlatformSettings = {
  name: string;
  shortName: string;
  tagline: string;
  supportEmail: string;
  logoUrl: string;
  brandColor: string;
  registration: {
    enabled: boolean;
    requireAdminApproval: boolean;
    allowedEmailDomains: string[];
    defaultCountry: string;
  };
  subscriptions: {
    enabled: boolean;
    defaultPlanCode: string;
    trialDays: number;
    currency: string;
  };
  features: {
    announcements: boolean;
    lessonLibrary: boolean;
    planner: boolean;
    analytics: boolean;
  };
  email: {
    senderName: string;
    senderEmail: string;
    replyTo: string;
    notificationsEnabled: boolean;
  };
  security: {
    sessionHours: number;
    requireMfa: boolean;
    loginAttemptsPerWindow: number;
    passwordMinLength: number;
  };
  maintenance: {
    enabled: boolean;
    message: string;
  };
};

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  name: "LessonHub",
  shortName: "LessonHub",
  tagline: "Plan Once. Teach Better. Grow Together.",
  supportEmail: "support@lessonhub.rw",
  logoUrl: "",
  brandColor: "#16246E",
  registration: {
    enabled: true,
    requireAdminApproval: false,
    allowedEmailDomains: [],
    defaultCountry: "Rwanda",
  },
  subscriptions: {
    enabled: true,
    defaultPlanCode: "free",
    trialDays: 30,
    currency: "RWF",
  },
  features: {
    announcements: true,
    lessonLibrary: true,
    planner: true,
    analytics: true,
  },
  email: {
    senderName: "LessonHub",
    senderEmail: "no-reply@lessonhub.rw",
    replyTo: "support@lessonhub.rw",
    notificationsEnabled: false,
  },
  security: {
    sessionHours: 12,
    requireMfa: false,
    loginAttemptsPerWindow: 12,
    passwordMinLength: 8,
  },
  maintenance: {
    enabled: false,
    message: "",
  },
};

type PlainObject = Record<string, unknown>;

function isPlainObject(v: unknown): v is PlainObject {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Merge stored partial settings over the defaults (arrays replace). */
function mergeSettings(base: PlatformSettings, stored: unknown): PlatformSettings {
  if (!isPlainObject(stored)) return { ...base };
  const out = { ...base } as unknown as PlainObject;
  for (const [key, value] of Object.entries(stored)) {
    const current = out[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      out[key] = { ...current, ...value };
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out as unknown as PlatformSettings;
}

export const PLATFORM_SETTING_KEY = "platform";

export async function getPlatformSettings(): Promise<PlatformSettings> {
  try {
    const row = await prisma.platformSetting.findUnique({ where: { key: PLATFORM_SETTING_KEY } });
    if (!row) return { ...DEFAULT_PLATFORM_SETTINGS };
    let stored: unknown = {};
    try {
      stored = row.value ? JSON.parse(row.value) : {};
    } catch {
      stored = {};
    }
    return mergeSettings(DEFAULT_PLATFORM_SETTINGS, stored);
  } catch {
    return { ...DEFAULT_PLATFORM_SETTINGS };
  }
}

export async function savePlatformSettings(
  patch: unknown,
  updatedBy: string
): Promise<PlatformSettings> {
  const current = await getPlatformSettings();
  const next = mergeSettings(current, patch);
  await prisma.platformSetting.upsert({
    where: { key: PLATFORM_SETTING_KEY },
    update: { value: JSON.stringify(next), updatedBy },
    create: { key: PLATFORM_SETTING_KEY, value: JSON.stringify(next), updatedBy },
  });
  return next;
}

/* ------------------------------------------------------------------ */
/* Default plans                                                       */
/* ------------------------------------------------------------------ */

export const PLAN_CODES = ["free", "basic", "professional", "enterprise"] as const;

const DEFAULT_PLANS = [
  {
    id: "plan_free",
    code: "free",
    name: "Free",
    description: "For a single school getting started with digital lesson planning.",
    monthlyPrice: 0,
    annualPrice: 0,
    maxTeachers: 5,
    maxUsers: 10,
    maxClasses: 8,
    maxStorageMb: 256,
    features: ["Lesson planner", "Lesson library", "1 academic year", "Community support"],
    isDefault: true,
    sortOrder: 1,
  },
  {
    id: "plan_basic",
    code: "basic",
    name: "Basic",
    description: "For small schools that need more staff and storage.",
    monthlyPrice: 25000,
    annualPrice: 250000,
    maxTeachers: 20,
    maxUsers: 40,
    maxClasses: 20,
    maxStorageMb: 2048,
    features: ["Everything in Free", "Up to 20 teachers", "Approvals workflow", "Email support"],
    isDefault: false,
    sortOrder: 2,
  },
  {
    id: "plan_professional",
    code: "professional",
    name: "Professional",
    description: "For growing schools that rely on analytics and collaboration.",
    monthlyPrice: 60000,
    annualPrice: 600000,
    maxTeachers: 80,
    maxUsers: 160,
    maxClasses: 60,
    maxStorageMb: 10240,
    features: [
      "Everything in Basic",
      "Up to 80 teachers",
      "Advanced analytics",
      "Priority support",
      "School-wide announcements",
    ],
    isDefault: false,
    sortOrder: 3,
  },
  {
    id: "plan_enterprise",
    code: "enterprise",
    name: "Enterprise",
    description: "For school groups and large institutions with custom needs.",
    monthlyPrice: 150000,
    annualPrice: 1500000,
    maxTeachers: null,
    maxUsers: null,
    maxClasses: null,
    maxStorageMb: null,
    features: [
      "Everything in Professional",
      "Unlimited teachers and classes",
      "Dedicated onboarding",
      "Custom integrations",
      "Service level agreement",
    ],
    isDefault: false,
    sortOrder: 4,
  },
] as const;

/** Idempotently create the four default plans; never overwrites edits. */
export async function ensureDefaultPlans(): Promise<void> {
  const existing = new Set(
    (await prisma.subscriptionPlan.findMany({ select: { code: true } })).map((p) => p.code)
  );
  for (const plan of DEFAULT_PLANS) {
    if (existing.has(plan.code)) continue;
    await prisma.subscriptionPlan.create({
      data: {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        description: plan.description,
        monthlyPrice: plan.monthlyPrice,
        annualPrice: plan.annualPrice,
        maxTeachers: plan.maxTeachers,
        maxUsers: plan.maxUsers,
        maxClasses: plan.maxClasses,
        maxStorageMb: plan.maxStorageMb,
        features: JSON.stringify(plan.features),
        isActive: true,
        isDefault: plan.isDefault,
        sortOrder: plan.sortOrder,
      },
    });
  }
}

export function dateOnly(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function addDaysISO(days: number, from: Date = new Date()): string {
  return new Date(from.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Create a trial/active subscription for a newly registered school when
 * subscriptions are enabled. Operational records only — no payment is
 * invented.
 */
export async function assignDefaultSubscription(
  schoolId: string,
  actor?: { name: string; email: string }
): Promise<void> {
  try {
    const settings = await getPlatformSettings();
    if (!settings.subscriptions.enabled) return;
    const existing = await prisma.schoolSubscription.findFirst({
      where: { schoolId, status: { in: ["trial", "active"] } },
      select: { id: true },
    });
    if (existing) return;

    await ensureDefaultPlans();
    const wanted = settings.subscriptions.defaultPlanCode || "free";
    const plan =
      (await prisma.subscriptionPlan.findFirst({ where: { code: wanted, isActive: true } })) ??
      (await prisma.subscriptionPlan.findFirst({ where: { isDefault: true, isActive: true } })) ??
      (await prisma.subscriptionPlan.findFirst({ where: { code: "free" } }));
    if (!plan) return;

    const trialDays = Math.max(0, Math.min(365, Number(settings.subscriptions.trialDays) || 0));
    const startDate = dateOnly();
    await prisma.schoolSubscription.create({
      data: {
        id: "sub_" + randomToken().slice(0, 18),
        schoolId,
        planId: plan.id,
        status: trialDays > 0 ? "trial" : "active",
        billingCycle: "monthly",
        startDate,
        renewsAt: addDaysISO(trialDays > 0 ? trialDays : 30),
        notes:
          trialDays > 0
            ? `${trialDays}-day trial on the ${plan.name} plan`
            : `Assigned the ${plan.name} plan on registration${
                actor ? ` by ${actor.name}` : ""
              }`,
      },
    });
  } catch (err) {
    // A subscription failure must not fail school registration.
    console.error("default subscription assignment failed", err);
  }
}
