import { prisma } from "@/lib/db";
import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { ensureDefaultPlans, getPlatformSettings, savePlatformSettings } from "@/lib/platform";
import { auditFromRequest } from "@/lib/audit";
import {
  badRequest,
  clean,
  isEmail,
  isHexColor,
  parseJsonObject,
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
  await ensureDefaultPlans().catch(() => {});
  const [settings, plans] = await Promise.all([
    getPlatformSettings(),
    prisma.subscriptionPlan.findMany({
      orderBy: [{ sortOrder: "asc" }, { monthlyPrice: "asc" }],
      include: { _count: { select: { subscriptions: true } } },
    }),
  ]);

  return Response.json(
    {
      settings,
      plans: plans.map(planJson),
      secretsConfigured: {
        smtpHost: !!process.env.SMTP_HOST,
        smtpUser: !!process.env.SMTP_USER,
        smtpPassword: !!process.env.SMTP_PASS || !!process.env.SMTP_PASSWORD,
        emailApiKey: !!process.env.EMAIL_API_KEY,
        paymentProvider: !!process.env.PAYMENT_PROVIDER_KEY,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

function validHttpUrl(value: string): boolean {
  if (!value) return true;
  if (value.startsWith("/")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function PUT(req: Request) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();

  const body = await readBody(req);
  const input = parseJsonObject(body.settings ?? body);
  const patch: Record<string, unknown> = {};
  const changed: string[] = [];

  for (const key of ["name", "shortName", "tagline"] as const) {
    if (input[key] !== undefined) {
      const value = clean(input[key], key === "tagline" ? 160 : 80);
      if (key !== "tagline" && !value) return badRequest("Platform name cannot be empty.");
      patch[key] = value;
      changed.push(key);
    }
  }
  if (input.supportEmail !== undefined) {
    const value = clean(input.supportEmail, 160).toLowerCase();
    if (value && !isEmail(value)) return badRequest("Enter a valid support email address.");
    patch.supportEmail = value;
    changed.push("supportEmail");
  }
  if (input.brandColor !== undefined) {
    const value = clean(input.brandColor, 7);
    if (!isHexColor(value)) return badRequest("Brand colour must be a hex value such as #16246E.");
    patch.brandColor = value;
    changed.push("brandColor");
  }
  if (input.logoUrl !== undefined) {
    const value = clean(input.logoUrl, 500);
    if (!validHttpUrl(value)) return badRequest("Logo URL must start with https:// or be an absolute path.");
    patch.logoUrl = value;
    changed.push("logoUrl");
  }

  if (input.registration !== undefined) {
    const r = parseJsonObject(input.registration);
    const out: Record<string, unknown> = {};
    if (r.enabled !== undefined) out.enabled = toBool(r.enabled, true);
    if (r.requireAdminApproval !== undefined) out.requireAdminApproval = toBool(r.requireAdminApproval, false);
    if (r.allowedEmailDomains !== undefined) {
      out.allowedEmailDomains = parseStringArray(r.allowedEmailDomains, 20, 120)
        .map((d) => d.toLowerCase().replace(/^@/, ""))
        .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d));
    }
    if (r.defaultCountry !== undefined) out.defaultCountry = clean(r.defaultCountry, 60);
    patch.registration = out;
    changed.push("registration");
  }

  if (input.subscriptions !== undefined) {
    const s = parseJsonObject(input.subscriptions);
    const out: Record<string, unknown> = {};
    if (s.enabled !== undefined) out.enabled = toBool(s.enabled, true);
    if (s.defaultPlanCode !== undefined) {
      const code = clean(s.defaultPlanCode, 40).toLowerCase();
      const plan = await prisma.subscriptionPlan.findUnique({ where: { code } });
      if (!plan) return badRequest("The default plan code does not exist.");
      out.defaultPlanCode = code;
    }
    if (s.trialDays !== undefined) out.trialDays = toInt(s.trialDays, 30, 0, 365);
    if (s.currency !== undefined) out.currency = clean(s.currency, 8).toUpperCase() || "RWF";
    patch.subscriptions = out;
    changed.push("subscriptions");
  }

  if (input.features !== undefined) {
    const f = parseJsonObject(input.features);
    const out: Record<string, unknown> = {};
    for (const key of ["announcements", "lessonLibrary", "planner", "analytics"] as const) {
      if (f[key] !== undefined) out[key] = toBool(f[key], true);
    }
    patch.features = out;
    changed.push("features");
  }

  if (input.email !== undefined) {
    const e = parseJsonObject(input.email);
    const out: Record<string, unknown> = {};
    if (e.senderName !== undefined) out.senderName = clean(e.senderName, 80);
    for (const [key, label] of [
      ["senderEmail", "sender email"],
      ["replyTo", "reply-to email"],
    ] as const) {
      if (e[key] !== undefined) {
        const value = clean(e[key], 160).toLowerCase();
        if (value && !isEmail(value)) return badRequest(`Enter a valid ${label} address.`);
        out[key] = value;
      }
    }
    if (e.notificationsEnabled !== undefined) out.notificationsEnabled = toBool(e.notificationsEnabled, false);
    patch.email = out;
    changed.push("email");
  }

  if (input.security !== undefined) {
    const s = parseJsonObject(input.security);
    const out: Record<string, unknown> = {};
    if (s.sessionHours !== undefined) out.sessionHours = toInt(s.sessionHours, 12, 1, 72);
    if (s.requireMfa !== undefined) out.requireMfa = toBool(s.requireMfa, false);
    if (s.loginAttemptsPerWindow !== undefined)
      out.loginAttemptsPerWindow = toInt(s.loginAttemptsPerWindow, 12, 3, 50);
    if (s.passwordMinLength !== undefined)
      out.passwordMinLength = toInt(s.passwordMinLength, 8, 8, 64);
    patch.security = out;
    changed.push("security");
  }

  if (input.maintenance !== undefined) {
    const m = parseJsonObject(input.maintenance);
    const out: Record<string, unknown> = {};
    if (m.enabled !== undefined) out.enabled = toBool(m.enabled, false);
    if (m.message !== undefined) out.message = clean(m.message, 500);
    patch.maintenance = out;
    changed.push("maintenance");
  }

  if (!changed.length) return badRequest("No settings were provided.");

  const settings = await savePlatformSettings(patch, admin.id);

  await auditFromRequest(req, admin, {
    action: "platform.settings_updated",
    targetType: "platform_settings",
    targetId: "platform",
    summary: `Updated platform settings: ${changed.join(", ")}`,
    metadata: { sections: changed },
  });

  return Response.json({ settings });
}
