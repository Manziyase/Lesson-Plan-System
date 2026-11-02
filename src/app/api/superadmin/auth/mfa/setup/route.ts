import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { generateTotpSecret, otpauthUrl } from "@/lib/totp";

export const dynamic = "force-dynamic";

/**
 * Begin MFA enrolment: returns a fresh TOTP secret and otpauth URI for the
 * signed-in admin only. Nothing is saved until the first code is verified.
 */
export async function POST() {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();
  const secret = generateTotpSecret();
  return Response.json(
    {
      secret,
      otpauth: otpauthUrl(secret, admin.email),
      issuer: "LessonHub",
      account: admin.email,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
