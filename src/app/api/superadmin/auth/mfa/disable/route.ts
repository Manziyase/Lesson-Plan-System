import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { getPlatformSettings } from "@/lib/platform";
import { auditFromRequest } from "@/lib/audit";
import { readBody } from "@/lib/platform-utils";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();

  const settings = await getPlatformSettings();
  if (settings.security.requireMfa) {
    return Response.json(
      { error: "Multi-factor authentication is required by platform policy and cannot be disabled." },
      { status: 403 }
    );
  }

  const body = await readBody(req);
  const password = typeof body.password === "string" ? body.password : "";
  const record = await prisma.platformAdmin.findUnique({ where: { id: admin.id } });
  if (!record || !verifyPassword(password, record.salt, record.passwordHash)) {
    return Response.json({ error: "Your password is incorrect." }, { status: 401 });
  }

  await prisma.platformAdmin.update({
    where: { id: admin.id },
    data: { mfaEnabled: false, mfaSecret: "" },
  });

  await auditFromRequest(req, admin, {
    action: "platform_admin.mfa_disabled",
    targetType: "platform_admin",
    targetId: admin.id,
    summary: "Super admin disabled multi-factor authentication",
  });

  return Response.json({ ok: true, mfaEnabled: false });
}
