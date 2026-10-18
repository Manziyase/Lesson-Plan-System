import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession, SESSION_COOKIE, SESSION_TTL_SECONDS, publicUser } from "@/lib/session";
import { str } from "@/lib/util";
import { throttleCheck, throttleRecord } from "@/lib/throttle";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!throttleCheck(ip)) {
    return Response.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
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
    return Response.json({ error: "Incorrect email or password." }, { status: 401 });
  }
  const token = await createSession(user.id);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    secure: process.env.NODE_ENV === "production",
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
