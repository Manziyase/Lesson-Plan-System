"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { LangSelect, useI18n } from "@/lib/i18n-client";
import { LangProvider } from "@/lib/i18n-client";
import { ThemeToggle } from "@/lib/theme";
import { Icon } from "@/components/icons";

function LoginForm() {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [regOpen, setRegOpen] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);

  useEffect(() => {
    api<{ registrationOpen?: boolean; signupOpen?: boolean }>("/api/auth/register-status")
      .then((r) => {
        setRegOpen(r.registrationOpen ?? false);
        setSignupOpen(r.signupOpen ?? false);
      })
      .catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api<{ user: { language?: string } }>("/api/auth/login", { method: "POST", body: { email, password } });
      if (res.user?.language) setLang(res.user.language as "en" | "fr" | "rw");
      router.push("/dashboard");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div style={{ textAlign: "center", marginBottom: 16, position: "relative" }}>
          <div className="auth-logo">
            <img src="/brand/logo-mark.png" alt="Inzozi Academy" />
          </div>
          <h1 className="auth-title" style={{ fontSize: "1.3rem", margin: "0 0 2px" }}>Inzozi Academy</h1>
          <p className="auth-sub">{t("Lesson Planning & Knowledge Management for Rwandan Schools")}</p>
          <div style={{ position: "absolute", top: -6, right: -6 }}>
            <ThemeToggle />
          </div>
        </div>

        <div className="auth-panel">
          {error ? <div className="form-error">{error}</div> : null}
          <form onSubmit={onSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label className="field-label" htmlFor="login-email">{t("Email")}</label>
              <input className="input" id="login-email" type="email" required autoComplete="username" placeholder="you@school.rw" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="field-label" htmlFor="login-password">{t("Password")}</label>
              <input className="input" id="login-password" type="password" required autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="field-label" htmlFor="login-lang">{t("Language")}</label>
              <LangSelect value={lang} onChange={setLang} className="input" />
            </div>
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              <Icon name="logout" size={15} style={{ transform: "scaleX(-1)" }} />
              {busy ? t("Signing in…") : t("Sign in")}
            </button>
          </form>
          <div className="demo-box">
            <strong>{t("Demo accounts")}</strong> ({t("password")} <code>changeme123</code>):<br />
            Admin: <code>admin@school.rw</code> · {t("Teacher")}: <code>jean@school.rw</code>
          </div>
          {regOpen ? (
            <p style={{ marginTop: 14, textAlign: "center", fontSize: ".85rem" }}>
              {t("New school?")}{" "}
              <Link href="/register" style={{ color: "var(--color-royal-700)", fontWeight: 700 }}>{t("Register your school")}</Link>
            </p>
          ) : null}
          {regOpen && signupOpen ? (
            <p style={{ margin: "6px 0 0", textAlign: "center", fontSize: ".78rem" }} className="muted">
              {t("First time here?")} <Link href="/signup" style={{ color: "var(--color-royal-700)", fontWeight: 600 }}>{t("Set up your school")}</Link>
            </p>
          ) : null}
        </div>

        <div className="auth-footer" style={{ textAlign: "center", marginTop: 14 }}>
          © {new Date().getFullYear()} Inzozi Academy · {t("Lesson Planning & Knowledge Management for Rwandan Schools")}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <LangProvider>
      <LoginForm />
    </LangProvider>
  );
}
