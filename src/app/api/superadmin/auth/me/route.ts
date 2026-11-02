import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { getPlatformSettings } from "@/lib/platform";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();
  const settings = await getPlatformSettings();
  return Response.json(
    {
      admin,
      platform: { name: settings.name, shortName: settings.shortName, logoUrl: settings.logoUrl },
      security: { requireMfa: settings.security.requireMfa },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
