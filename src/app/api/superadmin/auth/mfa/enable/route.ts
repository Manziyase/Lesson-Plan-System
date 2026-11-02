import { prisma } from "@/lib/db";
import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { verifyTotp } from "@/lib/totp";
import { auditFromRequest } from "@/lib/audit";
import { clean, readBody } from "@/lib/platform-utils";

export const dynamic = "force-dynamic";

/** Confirm enrolment by verifying one code, then persist the secret. */
export async function POST(req: Request) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();

  const body = await readBody(req);
  const secret = clean(body.secret, 120).toUpperCase();
  const code = clean(body.code, 12);

  if (secret.length < 16) {
    return Response.json({ error: "Invalid authenticator secret. Please start setup again." }, { status: 400 });
  }
  if (!verifyTotp(secret, code)) {
    return Response.json(
      { error: "That code is not valid. Check your authenticator app and try again." },
      { status: 400 }
    );
  }

  await prisma.platformAdmin.update({
    where: { id: admin.id },
    data: { mfaSecret: secret, mfaEnabled: true },
  });

  await auditFromRequest(req, admin, {
    action: "platform_admin.mfa_enabled",
    targetType: "platform_admin",
    targetId: admin.id,
    summary: "Super admin enabled multi-factor authentication",
  });

  return Response.json({ ok: true, mfaEnabled: true });
}
