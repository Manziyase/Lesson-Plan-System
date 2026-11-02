"use client";

import Link from "next/link";
import React, { useState } from "react";
import { Icon } from "@/components/icons";
import { saApi } from "@/lib/superadmin-client";

export function SuperAdminLogin() {
  const [step, setStep] = useState<"credentials" | "mfa">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Enter your email address and password.");
      return;
    }
    setBusy(true);
    try {
      const data = await saApi<{ mfaRequired?: boolean; challengeToken?: string }>(
        "/api/superadmin/auth/login",
        { method: "POST", body: { email, password }, redirectOn401: false }
      );
      if (data.mfaRequired && data.challengeToken) {
        setChallengeToken(data.challengeToken);
        setStep("mfa");
        setCode("");
      } else {
        window.location.href = "/superadmin";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    try {
      await saApi("/api/superadmin/auth/mfa", {
        method: "POST",
        body: { challengeToken, code: code.trim() },
        redirectOn401: false,
      });
      window.location.href = "/superadmin";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap sa-login-wrap">
      <div className="sa-login">
        <aside className="sa-login-brand">
          <div className="sa-login-brand__top">
            <span className="sa-brandmark large">
              <Icon name="shield" size={26} />
            </span>
            <div>
              <strong>LessonHub</strong>
              <span>Platform Console</span>
            </div>
          </div>
          <h1>Central control for every school on LessonHub.</h1>
          <p>
            Manage school workspaces, subscriptions, announcements and platform health from one secure
            place.
          </p>
          <ul className="sa-login-points">
            <li>
              <Icon name="school" size={16} /> School lifecycle & tenant oversight
            </li>
            <li>
              <Icon name="creditCard" size={16} /> Subscriptions, plans and recorded payments
            </li>
            <li>
              <Icon name="activity" size={16} /> Audit trail for every sensitive action
            </li>
            <li>
              <Icon name="shield" size={16} /> Separate identity, sessions and TOTP MFA
            </li>
          </ul>
          <div className="sa-login-brand__foot">
            Restricted to authorized platform administrators. All sign-in attempts are logged.
          </div>
        </aside>

        <div className="auth-panel sa-login-panel">
          <div className="sa-login-head">
            <h2>{step === "credentials" ? "Super Admin sign in" : "Two-factor verification"}</h2>
            <p>
              {step === "credentials"
                ? "Use your platform administrator credentials. School accounts cannot access this console."
                : "Enter the 6-digit code from your authenticator app to finish signing in."}
            </p>
          </div>

          {step === "credentials" ? (
            <form onSubmit={submitCredentials} className="stack" style={{ gap: 14 }}>
              <div>
                <label className="field-label" htmlFor="sa-email">
                  Email address
                </label>
                <input
                  id="sa-email"
                  className="input"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@lessonhub.rw"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="sa-password">
                  Password
                </label>
                <div className="sa-input-wrap">
                  <input
                    id="sa-password"
                    className="input"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="sa-input-eye"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    <Icon name={showPassword ? "eye" : "lock"} size={16} />
                  </button>
                </div>
              </div>
              {error ? <div className="form-error">{error}</div> : null}
              <button className="btn btn-primary btn-block" disabled={busy} type="submit">
                {busy ? <span className="sa-spin" /> : <Icon name="shield" size={16} />}
                {busy ? "Signing in…" : "Sign in to console"}
              </button>
            </form>
          ) : (
            <form onSubmit={submitMfa} className="stack" style={{ gap: 14 }}>
              <div>
                <label className="field-label" htmlFor="sa-code">
                  Authenticator code
                </label>
                <input
                  id="sa-code"
                  className="input sa-code-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                />
                <p className="field-hint">The code refreshes every 30 seconds.</p>
              </div>
              {error ? <div className="form-error">{error}</div> : null}
              <button className="btn btn-primary btn-block" disabled={busy} type="submit">
                {busy ? <span className="sa-spin" /> : <Icon name="checkCircle" size={16} />}
                {busy ? "Verifying…" : "Verify and continue"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={() => {
                  setStep("credentials");
                  setCode("");
                  setError("");
                  setChallengeToken("");
                }}
              >
                <Icon name="arrowLeft" size={15} /> Use a different account
              </button>
            </form>
          )}

          <div className="auth-footer" style={{ marginTop: 18, textAlign: "center" }}>
            <Link href="/">← Back to LessonHub</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
