import { prisma } from "@/lib/db";
import { getPlatformSettings } from "@/lib/platform";

export const dynamic = "force-dynamic";

/**
 * Informs the login page whether to show the "Register your school" link.
 * Registration is controlled by platform settings (not just the legacy
 * REGISTRATION_CLOSED env flag) and is always closed during maintenance.
 */
export async function GET() {
  const settings = await getPlatformSettings();
  const envClosed = process.env.REGISTRATION_CLOSED === "1";
  const maintenance = settings.maintenance.enabled;
  const legacyOpen = (await prisma.school.count()) === 0;
  return Response.json(
    {
      registrationOpen: settings.registration.enabled && !envClosed && !maintenance,
      signupOpen: legacyOpen && !envClosed && !maintenance,
      maintenance,
      maintenanceMessage: maintenance ? settings.maintenance.message : "",
      requireApproval: settings.registration.requireAdminApproval,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
