import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import LandingPage from "@/components/landing/LandingPage";

export const dynamic = "force-dynamic";

/*
 * "/" is the public front door: signed-in users go straight to their
 * dashboard, everyone else sees the marketing landing page.
 *
 * getSessionUser() only touches the database when a session cookie exists, so
 * an anonymous visitor renders the landing page without a query. The try/catch
 * keeps the marketing page alive even if the database is unreachable.
 */
export default async function RootPage() {
  let signedIn = false;
  try {
    signedIn = Boolean(await getSessionUser());
  } catch {
    signedIn = false;
  }
  if (signedIn) redirect("/dashboard");

  const registrationOpen = process.env.REGISTRATION_CLOSED !== "1";
  return <LandingPage registrationOpen={registrationOpen} />;
}
