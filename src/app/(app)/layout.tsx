import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { ToastProvider, ConfirmProvider } from "@/components/ui";
import { LangProvider } from "@/lib/i18n-client";
import { loadAppMeta } from "@/lib/app-meta";
import { ForcePasswordChange } from "@/components/force-password";

export const dynamic = "force-dynamic";

/*
 * Auth-guarded layout: every app page renders inside the shell and only for
 * signed-in users. Meta (school, classes, areas, years, teachers) is loaded
 * through the shared helper so it matches the /profile layout.
 *
 * Accounts with a temporary password get the explicit password gate INSTEAD
 * of the shell: previously every tab silently bounced back to /profile,
 * which looked like broken sidebar navigation.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) {
    return (
      <LangProvider initial={(user.language as "en" | "fr" | "rw") || "en"}>
        <ForcePasswordChange name={user.name} lang={user.language} />
      </LangProvider>
    );
  }

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
