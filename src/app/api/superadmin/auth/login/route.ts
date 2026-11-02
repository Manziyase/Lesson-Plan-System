import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import {
  createPlatformSession,
  createMfaChallenge,
  platformCookieOptions,
  publicPlatformAdmin,
  touchPlatformLogin,
  PLATFORM_COOKIE,
} from "@/lib/platform-auth";
import { throttleCheck, throttleRecord } from "@/lib/throttle";
import { audit, requestMeta } from "@/lib/audit";
import { clean, readBody } from "@/lib/platform-utils";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * Super Admin login step 1: email + password.
 * When MFA is enabled the response only contains a short-lived challenge;
 * no session cookie is issued until the TOTP code is verified.
 */
export async function POST(req: Request) {
  const meta = requestMeta(req);
  const key = "platform:" + meta.ip;
  if (!throttleCheck(key)) {
    return Response.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  }

  const body = await readBody(req);
  const email = clean(body.email, 160).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";

  let admin = await prisma.platformAdmin.findUnique({ where: { email } });
  if (!admin) {
    const all = await prisma.platformAdmin.findMany();
    admin = all.find((a) => a.email.toLowerCase() === email) ?? null;
  }
  const ok = !!admin && verifyPassword(password, admin.salt, admin.passwordHash);
  throttleRecord(key, ok);

  if (!ok || !admin) {
    await audit({
      actorType: "system",
      action: "auth.platform_login_failed",
      actorEmail: email,
      summary: "Super admin login failed (invalid credentials)",
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { reason: "invalid_credentials" },
    });
    return Response.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  if (admin.status !== "active") {
    await audit({
      actorType: "platform_admin",
      actorId: admin.id,
      actorName: admin.name,
      actorEmail: admin.email,
      action: "auth.platform_login_blocked",
      summary: "Super admin login blocked: account disabled",
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return Response.json({ error: "This super admin account is disabled." }, { status: 403 });
  }

  if (admin.mfaEnabled && admin.mfaSecret) {
    const challengeToken = await createMfaChallenge(admin.id);
    await audit({
      actorType: "platform_admin",
      actorId: admin.id,
      actorName: admin.name,
      actorEmail: admin.email,
      action: "auth.platform_mfa_challenge",
      summary: "Super admin password accepted; MFA challenge issued",
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return Response.json(
      { mfaRequired: true, challengeToken, expiresIn: 600 },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const { token, maxAge } = await createPlatformSession(admin.id, req);
  const store = await cookies();
  store.set(PLATFORM_COOKIE, token, platformCookieOptions(maxAge));
  await touchPlatformLogin(admin.id);

  await audit({
    actorType: "platform_admin",
    actorId: admin.id,
    actorName: admin.name,
    actorEmail: admin.email,
    action: "auth.platform_login",
    summary: "Super admin signed in",
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return Response.json(
    { admin: publicPlatformAdmin(admin), mfaRequired: false, mfaEnabled: admin.mfaEnabled },
    { headers: { "Cache-Control": "no-store" } }
  );
}
