"use client";

/*
 * Password gate — rendered by the app layout instead of the normal shell
 * when the signed-in account still uses the temporary password created by
 * an administrator (or school signup). Replacing the old silent "redirect
 * everything to /profile" behavior: the user now sees exactly WHY the other
 * tabs are unavailable, changes the password here, and the gate disappears
 * (server re-evaluation on refresh).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useI18n, LangSelect } from "@/lib/i18n-client";
import { ThemeToggle } from "@/lib/theme";
import { Icon } from "@/components/icons";

export function ForcePasswordChange({ name, lang }: { name: string; lang: string }) {
  const { t, setLang } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const current = String(fd.get("current") || "");
    const next = String(fd.get("next") || "");
    const confirmPw = String(fd.get("confirm") || "");
    if (next !== confirmPw) {
      setBusy(false);
      setError(t("New passwords do not match."));
      return;
    }
    try {
      await api("/api/auth/password", { method: "POST", body: { currentPassword: current, newPassword: next } });
      setDone(true);
      // Re-render the server layout: mustChangePassword is now false and
      // the full app (with working sidebar navigation) appears in place.
      setTimeout(() => router.refresh(), 900);
    } catch (err) {
      setBusy(false);
      setError((err as Error).message || t("Could not update the password."));
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div style={{ textAlign: "center", marginBottom: 18, position: "relative" }}>
          <div className="auth-logo">
            <Icon name="key" size={26} />
          </div>
          <h1 className="auth-title" style={{ fontSize: "1.25rem", margin: "0 0 2px" }}>
            {t("Welcome, {name}", { name: name.split(" ")[0] })}
          </h1>
          <p className="auth-sub">
            {t("Your account still uses a temporary password. Set your own password to unlock LessonHub.")}
          </p>
          <div style={{ position: "absolute", top: -6, right: -6 }}>
            <ThemeToggle />
          </div>
        </div>

        <div className="auth-panel">
          {done ? (
            <div className="form-ok" style={{ marginBottom: 0 }}>
              <Icon name="checkCircle" size={16} />
              <span>{t("Password updated — opening your planner…")}</span>
            </div>
          ) : (
            <>
              {error ? (
                <div className="form-error">
                  <Icon name="xCircle" size={16} />
                  <span>{error}</span>
                </div>
              ) : null}
              <form onSubmit={submit}>
                <div style={{ marginBottom: 14 }}>
                  <label className="field-label" htmlFor="gate-current">
                    {t("Temporary password")}
                  </label>
                  <input
                    className="input"
                    id="gate-current"
                    name="current"
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="changeme123"
                  />
                </div>
                <div className="form-grid-2" style={{ marginBottom: 14 }}>
                  <div>
                    <label className="field-label" htmlFor="gate-next">
                      {t("New password")}
                    </label>
                    <input
                      className="input"
                      id="gate-next"
                      name="next"
                      type="password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="gate-confirm">
                      {t("Confirm new password")}
                    </label>
                    <input
                      className="input"
                      id="gate-confirm"
                      name="confirm"
                      type="password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
                  <Icon name="key" size={15} />
                  {busy ? t("Saving…") : t("Set password & continue")}
                </button>
              </form>
              <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
                <LangSelect value={lang as "en" | "fr" | "rw"} onChange={setLang} className="input" />
              </div>
            </>
          )}
        </div>
        <div className="auth-footer" style={{ textAlign: "center", marginTop: 14 }}>
          LessonHub · {t("A smarter home for lesson planning and teaching knowledge.")}
        </div>
      </div>
    </div>
  );
}
