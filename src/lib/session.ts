/*
 * Server-side session management — same semantics as the legacy auth module:
 * opaque tokens in an HttpOnly SameSite=Lax cookie (`slp_session`), 30-day
 * TTL, stored in the Session table (so logout revokes server-side).
 */

import { cookies } from "next/headers";
import { prisma } from "./db";
import { getPlatformSettings } from "./platform";
import { randomToken } from "./password";
import { parseStringArray, nowISO } from "./util";

export const SESSION_COOKIE = "slp_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "teacher";
  schoolId: string;
  subjects: string[];
  classes: string[];
  language: string;
  mustChangePassword: boolean;
  activeYearId: string | null;
  createdAt: Date;
};

export async function createSession(userId: string): Promise<string> {
  const token = randomToken();
  await prisma.session.create({
    data: { token, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  return token;
}

export async function destroySession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await prisma.session.deleteMany({ where: { token } });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { token } });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { token } }).catch(() => {});
    return null;
  }
  const u = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!u) return null;
  /* Disabled accounts and suspended/deactivated school workspaces are
     rejected on every request, so a platform action takes effect without
     waiting for the session to expire. */
  if (u.status !== "active") {
    await prisma.session.deleteMany({ where: { userId: u.id } }).catch(() => {});
    return null;
  }
  const school = await prisma.school.findUnique({ where: { id: u.schoolId }, select: { status: true } });
  if (!school || school.status !== "active") {
    await prisma.session.deleteMany({ where: { userId: u.id } }).catch(() => {});
    return null;
  }
  /* Platform maintenance mode refuses school sessions without deleting the
     underlying data. Sessions are kept so access returns when maintenance
     ends; only the request is rejected. */
  const settings = await getPlatformSettings();
  if (settings.maintenance.enabled) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role === "admin" ? "admin" : "teacher",
    schoolId: u.schoolId,
    subjects: parseStringArray(u.subjects),
    classes: parseStringArray(u.classes),
    language: u.language,
    mustChangePassword: u.mustChangePassword,
    activeYearId: u.activeYearId,
    createdAt: u.createdAt,
  };
}

/** Public shape of a user record (never leaks password hashes). */
export function publicUser(u: SessionUser) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    schoolId: u.schoolId,
    subjects: u.subjects,
    classes: u.classes,
    language: u.language,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt,
  };
}

export function unauthorized() {
  return Response.json({ error: "Please sign in to continue." }, { status: 401 });
}

export function forbidden() {
  return Response.json({ error: "Administrator access required." }, { status: 403 });
}

export const SESSION_TTL_SECONDS = Math.floor(SESSION_TTL_MS / 1000);
export { nowISO };
