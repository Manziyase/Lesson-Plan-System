import { prisma } from "@/lib/db";
import { verifyTotp } from "@/lib/totp";
import {
  checkMfaChallenge,
  consumeMfaChallenge,
  createPlatformSession,
  platformCookieOptions,
  publicPlatformAdmin,
  recordMfaFailure,
  touchPlatformLogin,
  MFA_MAX_ATTEMPTS,
  PLATFORM_COOKIE,
} from "@/lib/platform-auth";
import { audit, requestMeta } from "@/lib/audit";
import { clean, readBody } from "@/lib/platform-utils";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/** Super Admin login step 2: verify the authenticator code. */
export async function POST(req: Request) {
  const meta = requestMeta(req);
  const body = await readBody(req);
  const token = clean(body.challengeToken, 200);
  const code = clean(body.code, 12);

  if (!token) {
    return Response.json({ error: "Your sign-in session expired. Please start again." }, { status: 401 });
  }

  const state = await checkMfaChallenge(token);
  if (!state.ok) {
    const message =
      state.reason === "expired"
        ? "Your verification window expired. Please sign in again."
        : state.reason === "locked"
          ? "Too many incorrect codes. Please sign in again."
          : "Invalid verification session. Please sign in again.";
    return Response.json({ error: message }, { status: 401 });
  }

  const admin = await prisma.platformAdmin.findUnique({ where: { id: state.adminId } });
  if (!admin || admin.status !== "active" || !admin.mfaEnabled || !admin.mfaSecret) {
    await consumeMfaChallenge(token);
    return Response.json({ error: "This account cannot complete sign-in." }, { status: 403 });
  }

  if (!verifyTotp(admin.mfaSecret, code)) {
    const attempts = await recordMfaFailure(token);
    const remaining = Math.max(0, MFA_MAX_ATTEMPTS - attempts);
    await audit({
      actorType: "platform_admin",
      actorId: admin.id,
      actorName: admin.name,
      actorEmail: admin.email,
      action: "auth.platform_mfa_failed",
      summary: "Incorrect super admin MFA code",
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { remaining },
    });
    return Response.json(
      {
        error:
          remaining > 0
            ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
            : "Too many incorrect codes. Please sign in again.",
      },
      { status: 401 }
    );
  }

  await consumeMfaChallenge(token);
  const { token: sessionToken, maxAge } = await createPlatformSession(admin.id, req);
  const store = await cookies();
  store.set(PLATFORM_COOKIE, sessionToken, platformCookieOptions(maxAge));
  await touchPlatformLogin(admin.id);

  await audit({
    actorType: "platform_admin",
    actorId: admin.id,
    actorName: admin.name,
    actorEmail: admin.email,
    action: "auth.platform_login",
    summary: "Super admin signed in with MFA",
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { mfa: true },
  });

  return Response.json(
    { admin: publicPlatformAdmin(admin), mfaRequired: false },
    { headers: { "Cache-Control": "no-store" } }
  );
}
