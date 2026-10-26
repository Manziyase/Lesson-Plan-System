import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { ToastProvider, ConfirmProvider } from "@/components/ui";
import { LangProvider } from "@/lib/i18n-client";
import { loadAppMeta } from "@/lib/app-meta";

export const dynamic = "force-dynamic";

/*
 * /profile sits OUTSIDE the guarded `(app)` group on purpose. The (app)
 * layout sends every `mustChangePassword` user to /profile; if /profile
 * rendered inside that same layout, the layout would redirect to /profile
 * again on every request — an infinite redirect loop (ERR_TOO_MANY_REDIRECTS).
 *
 * This layout still requires a signed-in user, loads the same meta payload
 * as the (app) layout, and never forwards users away, so the forced
 * password-change page always loads.
 */
export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const meta = await loadAppMeta(user);

  return (
    <LangProvider initial={(user.language as "en" | "fr" | "rw") || "en"}>
      <ToastProvider>
        <ConfirmProvider>
          <Shell meta={meta}>{children}</Shell>
        </ConfirmProvider>
      </ToastProvider>
    </LangProvider>
  );
}
