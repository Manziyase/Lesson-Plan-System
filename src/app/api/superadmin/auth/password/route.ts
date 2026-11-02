import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { getPlatformAdmin, platformUnauthorized, PLATFORM_COOKIE } from "@/lib/platform-auth";
import { getPlatformSettings } from "@/lib/platform";
import { auditFromRequest } from "@/lib/audit";
import { readBody } from "@/lib/platform-utils";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/** Change the signed-in super admin password; other sessions are revoked. */
export async function POST(req: Request) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();

  const body = await readBody(req);
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  const record = await prisma.platformAdmin.findUnique({ where: { id: admin.id } });
  if (!record || !verifyPassword(currentPassword, record.salt, record.passwordHash)) {
    return Response.json({ error: "Your current password is incorrect." }, { status: 401 });
  }

  const settings = await getPlatformSettings();
  const minLength = Math.min(64, Math.max(8, Number(settings.security.passwordMinLength) || 8));
  if (newPassword.length < minLength) {
    return Response.json(
      { error: `New password must be at least ${minLength} characters.` },
      { status: 400 }
    );
  }
  if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
    return Response.json(
      { error: "New password must include at least one letter and one number." },
      { status: 400 }
    );
  }

  const { salt, hash } = hashPassword(newPassword);
  await prisma.platformAdmin.update({
    where: { id: admin.id },
    data: { salt, passwordHash: hash, mustChangePassword: false },
  });

  const store = await cookies();
  const currentToken = store.get(PLATFORM_COOKIE)?.value;
  if (currentToken) {
    await prisma.platformSession
      .deleteMany({ where: { adminId: admin.id, NOT: { token: currentToken } } })
      .catch(() => {});
  } else {
    await prisma.platformSession.deleteMany({ where: { adminId: admin.id } }).catch(() => {});
  }

  await auditFromRequest(req, admin, {
    action: "platform_admin.password_changed",
    targetType: "platform_admin",
    targetId: admin.id,
    summary: "Super admin changed their password",
  });

  return Response.json({ ok: true });
}
