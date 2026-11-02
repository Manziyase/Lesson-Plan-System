import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession, SESSION_COOKIE, SESSION_TTL_SECONDS, publicUser } from "@/lib/session";
import { str } from "@/lib/util";
import { throttleCheck, throttleRecord } from "@/lib/throttle";
import { getPlatformSettings } from "@/lib/platform";
import { audit, requestMeta } from "@/lib/audit";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const meta = requestMeta(req);
  if (!throttleCheck(ip)) {
    return Response.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  }
  const settings = await getPlatformSettings();
  if (settings.maintenance.enabled) {
    return Response.json(
      {
        error:
          settings.maintenance.message ||
          "LessonHub is temporarily in maintenance mode. Please try again shortly.",
      },
      { status: 503 }
    );
  }
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const email = str(body.email).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  // SQLite has no case-insensitive equals; try exact first, then scan the
  // (small) user table for a case-insensitive match, like the legacy server.
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const all = await prisma.user.findMany();
    user = all.find((u) => u.email.toLowerCase() === email) ?? null;
  }
  const ok = !!user && verifyPassword(password, user.salt, user.passwordHash);
  throttleRecord(ip, ok);
  if (!ok || !user) {
    await audit({
      actorType: "system",
      action: "auth.login_failed",
      actorEmail: email.slice(0, 160),
      summary: "School login failed (invalid credentials)",
      schoolId: user?.schoolId ?? "",
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { reason: "invalid_credentials" },
    });
    return Response.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  /* Platform-level account/workspace status gates. */
  const school = await prisma.school.findUnique({
    where: { id: user.schoolId },
    select: { id: true, name: true, status: true, statusReason: true },
  });
  if (user.status !== "active") {
    await audit({
      actorType: "school_user",
      actorId: user.id,
      actorName: user.name,
      actorEmail: user.email,
      action: "auth.login_blocked",
      targetType: "user",
      targetId: user.id,
      schoolId: user.schoolId,
      summary: "Login blocked: account disabled",
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return Response.json(
      {
        error:
          "This account has been disabled. Please contact your school administrator or LessonHub support.",
      },
      { status: 403 }
    );
  }
  if (!school || school.status !== "active") {
    const pending = school?.status === "pending";
    await audit({
      actorType: "school_user",
      actorId: user.id,
      actorName: user.name,
      actorEmail: user.email,
      action: "auth.login_blocked",
      targetType: "school",
      targetId: user.schoolId,
      schoolId: user.schoolId,
      summary: `Login blocked: school ${school?.status ?? "missing"}`,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { reason: school?.statusReason || "" },
    });
    return Response.json(
      {
        error: pending
          ? "This school registration is still awaiting approval. You will be able to sign in once a platform administrator activates the workspace."
          : "This school workspace is currently unavailable. Please contact LessonHub support for assistance.",
      },
      { status: 403 }
    );
  }

  const token = await createSession(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {});
  await prisma.school
    .update({ where: { id: user.schoolId }, data: { lastActiveAt: new Date() } })
    .catch(() => {});

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });

  await audit({
    actorType: "school_user",
    actorId: user.id,
    actorName: user.name,
    actorEmail: user.email,
    action: "auth.login",
    targetType: "school",
    targetId: user.schoolId,
    schoolId: user.schoolId,
    summary: `Signed in to ${school.name}`,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return Response.json({
    user: publicUser({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role === "admin" ? "admin" : "teacher",
      schoolId: user.schoolId,
      subjects: [],
      classes: [],
      language: user.language,
      mustChangePassword: user.mustChangePassword,
      activeYearId: user.activeYearId,
      createdAt: user.createdAt,
    }),
  });
}
