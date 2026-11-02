/*
 * Platform Admin authentication — deliberately separate from school users.
 *
 *  • own table (PlatformAdmin) and own cookie (slp_platform_session)
 *  • HttpOnly + SameSite=Strict cookie, Secure in production
 *  • opaque random token stored in PlatformSession (server-side revoke)
 *  • optional TOTP MFA via a short-lived PlatformMfaChallenge
 *
 * No school user, registration form or profile editor can reach this layer.
 */

import { cookies } from "next/headers";
import { prisma } from "./db";
import { randomToken } from "./password";
import { getPlatformSettings } from "./platform";
import { requestMeta } from "./audit";

export const PLATFORM_COOKIE = "slp_platform_session";
export const MFA_CHALLENGE_TTL_MS = 10 * 60 * 1000;
const MFA_MAX_ATTEMPTS = 5;

export type PlatformAdminSession = {
  id: string;
  name: string;
  email: string;
  status: string;
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
};

export function publicPlatformAdmin(a: {
  id: string;
  name: string;
  email: string;
  status: string;
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}): PlatformAdminSession {
  return {
    id: a.id,
    name: a.name,
    email: a.email,
    status: a.status,
    mfaEnabled: a.mfaEnabled,
    mustChangePassword: a.mustChangePassword,
    lastLoginAt: a.lastLoginAt,
    createdAt: a.createdAt,
  };
}

async function sessionTtlMs(): Promise<number> {
  const settings = await getPlatformSettings();
  const hours = Math.min(72, Math.max(1, Number(settings.security.sessionHours) || 12));
  return hours * 60 * 60 * 1000;
}

export async function createPlatformSession(
  adminId: string,
  req: Request
): Promise<{ token: string; maxAge: number }> {
  const token = randomToken();
  const ttl = await sessionTtlMs();
  const meta = requestMeta(req);
  await prisma.platformSession.create({
    data: {
      token,
      adminId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt: new Date(Date.now() + ttl),
    },
  });
  return { token, maxAge: Math.floor(ttl / 1000) };
}

export function platformCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    path: "/",
    maxAge,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function destroyPlatformSession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await prisma.platformSession.deleteMany({ where: { token } });
}

export async function getPlatformAdmin(): Promise<PlatformAdminSession | null> {
  try {
    const store = await cookies();
    const token = store.get(PLATFORM_COOKIE)?.value;
    if (!token) return null;
    const session = await prisma.platformSession.findUnique({ where: { token } });
    if (!session) return null;
    if (session.expiresAt.getTime() < Date.now()) {
      await prisma.platformSession.delete({ where: { token } }).catch(() => {});
      return null;
    }
    const admin = await prisma.platformAdmin.findUnique({ where: { id: session.adminId } });
    if (!admin || admin.status !== "active") {
      await prisma.platformSession.deleteMany({ where: { adminId: session.adminId } }).catch(() => {});
      return null;
    }
    return publicPlatformAdmin(admin);
  } catch {
    return null;
  }
}

export async function touchPlatformLogin(adminId: string): Promise<void> {
  await prisma.platformAdmin.update({
    where: { id: adminId },
    data: { lastLoginAt: new Date() },
  });
}

export function platformUnauthorized() {
  return Response.json({ error: "Super admin authentication required." }, { status: 401 });
}

export function platformForbidden(message = "Super admin access required.") {
  return Response.json({ error: message }, { status: 403 });
}

/* ---------------------------- MFA challenges ---------------------------- */

export async function createMfaChallenge(adminId: string): Promise<string> {
  await prisma.platformMfaChallenge.deleteMany({
    where: { OR: [{ adminId, expiresAt: { lt: new Date() } }, { adminId }] },
  });
  const token = randomToken();
  await prisma.platformMfaChallenge.create({
    data: {
      token,
      adminId,
      expiresAt: new Date(Date.now() + MFA_CHALLENGE_TTL_MS),
    },
  });
  return token;
}

export type MfaChallengeState =
  | { ok: true; adminId: string }
  | { ok: false; reason: "missing" | "expired" | "locked" };

export async function checkMfaChallenge(token: string): Promise<MfaChallengeState> {
  const challenge = await prisma.platformMfaChallenge.findUnique({ where: { token } });
  if (!challenge) return { ok: false, reason: "missing" };
  if (challenge.expiresAt.getTime() < Date.now()) {
    await prisma.platformMfaChallenge.deleteMany({ where: { token } }).catch(() => {});
    return { ok: false, reason: "expired" };
  }
  if (challenge.attempts >= MFA_MAX_ATTEMPTS) {
    await prisma.platformMfaChallenge.deleteMany({ where: { token } }).catch(() => {});
    return { ok: false, reason: "locked" };
  }
  return { ok: true, adminId: challenge.adminId };
}

/** Record a wrong MFA code; locks the challenge after five failures. */
export async function recordMfaFailure(token: string): Promise<number> {
  const challenge = await prisma.platformMfaChallenge.findUnique({ where: { token } });
  if (!challenge) return MFA_MAX_ATTEMPTS;
  const attempts = challenge.attempts + 1;
  if (attempts >= MFA_MAX_ATTEMPTS) {
    await prisma.platformMfaChallenge.deleteMany({ where: { token } }).catch(() => {});
  } else {
    await prisma.platformMfaChallenge.update({ where: { token }, data: { attempts } });
  }
  return attempts;
}

export async function consumeMfaChallenge(token: string): Promise<void> {
  await prisma.platformMfaChallenge.deleteMany({ where: { token } }).catch(() => {});
}

export { MFA_MAX_ATTEMPTS };
