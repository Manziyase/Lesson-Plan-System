import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Informs the login page whether to show the "Register your school" link.
 * The legacy /signup collapses after the first school; school admin
 * registration creates a separate workspace per registration, so it stays
 * open unless the deployment opts out with REGISTRATION_CLOSED=1.
 */
export async function GET() {
  const closed = process.env.REGISTRATION_CLOSED === "1";
  const legacyOpen = (await prisma.school.count()) === 0;
  return Response.json({
    registrationOpen: !closed,
    signupOpen: legacyOpen,
  });
}
