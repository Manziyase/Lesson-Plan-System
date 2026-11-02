import crypto from "crypto";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { getPlatformSettings } from "@/lib/platform";
import { audit, requestMeta } from "@/lib/audit";
import { badRequest, clean, readBody } from "@/lib/platform-utils";

export const dynamic = "force-dynamic";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!name || !domain) return "***";
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"*".repeat(Math.max(2, name.length - visible.length))}@${domain}`;
}

async function findValidToken(token: string) {
  if (!token) return null;
  const row = await prisma.recoveryToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { school: { select: { name: true, status: true } } } } },
  });
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) return null;
  if (row.user.status !== "active" || row.user.school.status !== "active") return null;
  return row;
}

/** Validate a recovery link so the page can show who it belongs to. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = clean(url.searchParams.get("token"), 200);
  const row = await findValidToken(token);
  if (!row) {
    return Response.json(
      { valid: false, error: "This recovery link is invalid or has expired. Please request a new one." },
      { status: 404 }
    );
  }
  return Response.json(
    {
      valid: true,
      name: row.user.name,
      email: maskEmail(row.user.email),
      school: row.user.school.name,
      expiresAt: row.expiresAt.toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/** Consume the one-time link and set a new password. */
export async function POST(req: Request) {
  const meta = requestMeta(req);
  const body = await readBody(req);
  const token = clean(body.token, 200);
  const password = typeof body.password === "string" ? body.password : "";
  const confirm = typeof body.passwordConfirm === "string" ? body.passwordConfirm : "";

  const row = await findValidToken(token);
  if (!row) {
    return Response.json(
      { error: "This recovery link is invalid or has expired. Please request a new one." },
      { status: 400 }
    );
  }

  const settings = await getPlatformSettings();
  const minLength = Math.min(64, Math.max(8, Number(settings.security.passwordMinLength) || 8));
  if (password.length < minLength) {
    return badRequest(`Password must be at least ${minLength} characters.`);
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return badRequest("Password must include at least one letter and one number.");
  }
  if (password !== confirm) return badRequest("Passwords do not match.");

  const { salt, hash } = hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { salt, passwordHash: hash, mustChangePassword: false },
    }),
    prisma.recoveryToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: row.userId } }),
    prisma.recoveryToken.deleteMany({ where: { userId: row.userId, id: { not: row.id }, usedAt: null } }),
  ]);

  await audit({
    actorType: "system",
    action: "auth.password_recovered",
    targetType: "user",
    targetId: row.userId,
    actorName: row.user.name,
    actorEmail: row.user.email,
    schoolId: row.user.schoolId,
    summary: `Password reset through a one-time recovery link for ${row.user.email}`,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return Response.json({ ok: true, email: row.user.email });
}
