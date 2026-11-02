"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/lib/theme";
import { Icon } from "@/components/icons";

type RecoveryInfo = {
  valid: true;
  name: string;
  email: string;
  school: string;
  expiresAt: string;
};

async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  try {
    return (await res.json()) as T & { error?: string };
  } catch {
    return {} as T & { error?: string };
  }
}

export function RecoverForm({ token }: { token: string }) {
  const [checking, setChecking] = useState(true);
  const [info, setInfo] = useState<RecoveryInfo | null>(null);
  const [linkError, setLinkError] = useState("");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    let alive = true;
    if (!token) {
      setChecking(false);
      setLinkError("This recovery link is missing its token.");
      return;
    }
    fetch(`/api/auth/recovery?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await readJson<RecoveryInfo>(res);
        if (!alive) return;
        if (!res.ok || !data.valid) {
          setLinkError(data.error || "This recovery link is invalid or has expired.");
        } else {
          setInfo(data);
        }
      })
      .catch(() => {
        if (alive) setLinkError("Could not verify this recovery link. Check your connection and try again.");
      })
      .finally(() => {
        if (alive) setChecking(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError("Password must include at least one letter and one number.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, passwordConfirm: confirm }),
      });
      const data = await readJson<{ ok: boolean; email?: string }>(res);
      if (!res.ok || !data.ok) {
        setError(data.error || "Could not reset this password. The link may have expired.");
        return;
      }
      setDone(data.email || info?.email || "your account");
      setPassword("");
      setConfirm("");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <Link href="/login" className="auth-home">
          <Icon name="arrowLeft" size={15} />
          Back to sign in
        </Link>
        <div style={{ textAlign: "center", marginBottom: 16, position: "relative" }}>
          <div className="auth-logo">
            <Icon name="key" size={28} />
          </div>
          <h1 className="auth-title" style={{ fontSize: "1.3rem", margin: "0 0 2px" }}>
            Reset your password
          </h1>
          <p className="auth-sub">One-time recovery link</p>
          <div style={{ position: "absolute", top: -6, right: -6 }}>
            <ThemeToggle />
          </div>
        </div>

        <div className="auth-panel">
          {checking ? (
            <p className="muted" style={{ textAlign: "center", margin: "18px 0" }}>
              Checking your recovery link…
            </p>
          ) : linkError ? (
            <div className="stack" style={{ gap: 14 }}>
              <div className="form-error">{linkError}</div>
              <p className="muted" style={{ margin: 0, fontSize: ".86rem" }}>
                Recovery links expire after one hour and can only be used once. Ask your school administrator or the
                platform support team for a new link.
              </p>
              <Link className="btn btn-primary btn-block" href="/login">
                <Icon name="arrowLeft" size={15} /> Back to sign in
              </Link>
            </div>
          ) : done ? (
            <div className="stack" style={{ gap: 14 }}>
              <div className="sa-callout">
                <Icon name="checkCircle" size={16} />
                <span>
                  Your password was changed for <strong>{done}</strong>. Every other signed-in device has been
                  signed out.
                </span>
              </div>
              <Link className="btn btn-primary btn-block" href="/login">
                <Icon name="logout" size={15} style={{ transform: "scaleX(-1)" }} /> Sign in with your new password
              </Link>
            </div>
          ) : (
            <>
              <div className="sa-callout" style={{ marginBottom: 14 }}>
                <Icon name="userCircle" size={16} />
                <span>
                  Resetting the password for <strong>{info?.name}</strong> ({info?.email}) at{" "}
                  <strong>{info?.school}</strong>.
                </span>
              </div>
              {error ? <div className="form-error">{error}</div> : null}
              <form onSubmit={onSubmit}>
                <div style={{ marginBottom: 14 }}>
                  <label className="field-label" htmlFor="recover-password">
                    New password
                  </label>
                  <div className="sa-input-wrap">
                    <input
                      className="input"
                      id="recover-password"
                      type={show ? "text" : "password"}
                      required
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                    />
                    <button
                      type="button"
                      className="sa-input-eye"
                      onClick={() => setShow((s) => !s)}
                      aria-label={show ? "Hide password" : "Show password"}
                    >
                      <Icon name={show ? "eye" : "lock"} size={16} />
                    </button>
                  </div>
                  <p className="field-hint">Use at least one letter and one number.</p>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label className="field-label" htmlFor="recover-confirm">
                    Confirm new password
                  </label>
                  <input
                    className="input"
                    id="recover-confirm"
                    type={show ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
                <button className="btn btn-primary btn-block" type="submit" disabled={busy || !token}>
                  <Icon name="key" size={15} />
                  {busy ? "Saving…" : "Set new password"}
                </button>
              </form>
              <p className="muted" style={{ marginTop: 14, fontSize: ".76rem", textAlign: "center" }}>
                This link can be used once. After it is used, all active sessions for the account are signed out.
              </p>
            </>
          )}
        </div>

        <div className="auth-footer" style={{ textAlign: "center", marginTop: 14 }}>
          © {new Date().getFullYear()} LessonHub · A smarter home for lesson planning and teaching knowledge.
        </div>
      </div>
    </div>
  );
}
