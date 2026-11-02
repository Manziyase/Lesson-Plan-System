import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { getPlatformSettings } from "@/lib/platform";
import { auditFromRequest } from "@/lib/audit";
import { badRequest, clean, isEmail, readBody } from "@/lib/platform-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();
  const admins = await prisma.platformAdmin.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      mfaEnabled: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  return Response.json(
    { admins, me: admin.id },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();

  const body = await readBody(req);
  const name = clean(body.name, 80);
  const email = clean(body.email, 160).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";

  if (!name) return badRequest("Full name is required.");
  if (!isEmail(email)) return badRequest("Enter a valid email address.");

  const settings = await getPlatformSettings();
  const minLength = Math.min(64, Math.max(8, Number(settings.security.passwordMinLength) || 8));
  if (password.length < minLength) {
    return badRequest(`Password must be at least ${minLength} characters.`);
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return badRequest("Password must include at least one letter and one number.");
  }

  const existing = await prisma.platformAdmin.findUnique({ where: { email } });
  if (existing) return badRequest("A super admin with this email already exists.");

  const { salt, hash } = hashPassword(password);
  const created = await prisma.platformAdmin.create({
    data: {
      id: "padmin_" + crypto.randomUUID().slice(0, 14),
      name,
      email,
      salt,
      passwordHash: hash,
      status: "active",
      mfaEnabled: false,
      mustChangePassword: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      mfaEnabled: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  await auditFromRequest(req, admin, {
    action: "platform_admin.create",
    targetType: "platform_admin",
    targetId: created.id,
    summary: `Created super admin ${created.name} (${created.email})`,
    metadata: { email: created.email },
  });

  return Response.json({ admin: created }, { status: 201 });
}
