"use client";

/*
 * First-run signup wizard — port of the legacy Views.signup():
 *   Step 1: administrator account (created server-side immediately)
 *   Step 2: school info (skippable)
 *   Step 3: class levels (skippable — finish later in School Settings)
 * Shown only while the installation has no school.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { LangSelect, useI18n } from "@/lib/i18n-client";
import { LangProvider } from "@/lib/i18n-client";
import { ThemeToggle } from "@/lib/theme";
import { Icon } from "@/components/icons";

const LEVEL_NAMES: Record<string, string> = {
  N1: "Nursery 1", N2: "Nursery 2", N3: "Nursery 3",
  P1: "P1", P2: "P2", P3: "P3", P4: "P4", P5: "P5", P6: "P6",
  S1: "S1", S2: "S2", S3: "S3", S4: "S4", S5: "S5", S6: "S6",
};
const LEVEL_GROUPS = [
  { name: "Nursery", ids: ["N1", "N2", "N3"] },
  { name: "Primary", ids: ["P1", "P2", "P3", "P4", "P5", "P6"] },
  { name: "Secondary", ids: ["S1", "S2", "S3", "S4", "S5", "S6"] },
];

function Wizard() {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState<boolean | null>(null);
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [admin, setAdmin] = useState({ name: "", email: "", password: "" });
  const [school, setSchool] = useState({ name: "", district: "", sector: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ open: boolean }>("/api/auth/signup-status")
      .then((r) => {
        setOpen(r.open);
        if (!r.open) router.replace("/login");
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  async function submitAdmin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/api/auth/signup", { method: "POST", body: { admin: { ...admin, language: lang } } });
      setStep(2);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  async function submitSchool(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/api/school/info", { method: "PUT", body: school });
      setStep(3);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  async function finish(levels: string[]) {
    setBusy(true);
    try {
      if (levels.length) {
        await api("/api/school/classes", { method: "PUT", body: { levels, streamsByLevel: {} } });
      }
      window.location.href = "/dashboard";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (open === false || open === null) return null;

  const steps = [t("Your information"), t("School information"), t("Classes")];

  return (
    <div className="auth-wrap">
      <div className="auth-card card" style={{ maxWidth: 480 }}>
        <div style={{ textAlign: "center", marginBottom: 14, position: "relative" }}>
          <div className="auth-logo">
            <Icon name="book" size={28} />
          </div>
          <h1 className="auth-title" style={{ fontSize: "1.2rem", margin: "0 0 2px" }}>LessonHub</h1>
          <p className="auth-sub">{t("Set up your school on LessonHub")}</p>
          <div style={{ position: "absolute", top: -6, right: -6 }}>
            <ThemeToggle />
          </div>
        </div>
        <ol className="steps">
          {steps.map((s, i) => (
            <li key={s} className={step === i + 1 ? "on" : step > i + 1 ? "done" : ""}>{s}</li>
          ))}
        </ol>
        {error ? <div className="form-error">{error}</div> : null}

        {step === 1 ? (
          <form onSubmit={submitAdmin}>
            <div style={{ marginBottom: 14 }}>
              <label className="field-label" htmlFor="su-name">{t("Full name")}</label>
              <input className="input" id="su-name" required maxLength={80} autoComplete="name" value={admin.name} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="field-label" htmlFor="su-email">{t("Email")}</label>
              <input className="input" id="su-email" type="email" required autoComplete="username" placeholder="you@school.rw" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} />
            </div>
            <div className="form-grid-2" style={{ marginBottom: 14 }}>
              <div>
                <label className="field-label" htmlFor="su-password">{t("Password")}</label>
                <input className="input" id="su-password" type="password" required minLength={6} autoComplete="new-password" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} />
              </div>
              <div>
                <label className="field-label" htmlFor="su-password2">{t("Confirm password")}</label>
                <input className="input" id="su-password2" type="password" required minLength={6} autoComplete="new-password" />
              </div>
            </div>
            <button className="btn btn-primary btn-block" disabled={busy}>
              <Icon name="arrowRight" size={15} /> {busy ? t("Creating account…") : t("Continue")}
            </button>
            <p className="muted" style={{ marginTop: 12, fontSize: ".78rem", textAlign: "center" }}>{t("You will set up your school in the next step.")}</p>
          </form>
        ) : null}

        {step === 2 ? (
          <form onSubmit={submitSchool}>
            <div style={{ marginBottom: 14 }}>
              <label className="field-label" htmlFor="su-sname">{t("School name")}</label>
              <input className="input" id="su-sname" required maxLength={120} placeholder={t("e.g. GS Kanyinya")} value={school.name} onChange={(e) => setSchool({ ...school, name: e.target.value })} />
            </div>
            <div className="form-grid-2" style={{ marginBottom: 14 }}>
              <div>
                <label className="field-label" htmlFor="su-district">{t("District")}</label>
                <input className="input" id="su-district" maxLength={80} placeholder={t("e.g. Nyarugenge")} value={school.district} onChange={(e) => setSchool({ ...school, district: e.target.value })} />
              </div>
              <div>
                <label className="field-label" htmlFor="su-sector">{t("Sector")}</label>
                <input className="input" id="su-sector" maxLength={80} placeholder={t("e.g. Kanyinya")} value={school.sector} onChange={(e) => setSchool({ ...school, sector: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <button className="btn btn-primary btn-block" disabled={busy}><Icon name="arrowRight" size={15} /> {busy ? t("Saving…") : t("Continue")}</button>
              <button type="button" className="btn btn-block" onClick={() => setStep(3)}>{t("Skip for now")}</button>
            </div>
            <p className="muted" style={{ marginTop: 12, fontSize: ".78rem", textAlign: "center" }}>{t("You can change this later in School Settings.")}</p>
          </form>
        ) : null}

        {step === 3 ? (
          <div>
            {LEVEL_GROUPS.map((g) => (
              <div key={g.name} style={{ border: "1px solid var(--color-line-soft)", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: ".85rem", marginBottom: 8 }}>{t(g.name)}</div>
                <LevelPicker group={g.ids} />
              </div>
            ))}
            <button className="btn btn-primary btn-block" disabled={busy} onClick={() => {
              const checked = Array.from(document.querySelectorAll<HTMLInputElement>(".signup-levels input:checked")).map((c) => c.value);
              finish(checked);
            }}>
              <Icon name="check" size={15} /> {busy ? t("Saving…") : t("Finish setup")}
            </button>
            <button className="btn btn-block" style={{ marginTop: 8 }} onClick={() => finish([])}>{t("Set this up later")}</button>
            <p className="muted" style={{ marginTop: 12, fontSize: ".78rem", textAlign: "center" }}>
              {t("Only selected classes appear in the app. You can change this any time in School Settings.")}
            </p>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 16, fontSize: ".8rem" }}>
          <span className="muted">{t("Language")}</span>
          <LangSelect value={lang} onChange={setLang} className="input" />
        </div>
      </div>
    </div>
  );
}

function LevelPicker({ group }: { group: string[] }) {
  const [checked, setChecked] = useState<string[]>([]);
  return (
    <div className="chips signup-levels" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {group.map((id) => (
        <label key={id} className="check-pill">
          <input
            type="checkbox"
            value={id}
            checked={checked.includes(id)}
            onChange={(e) => setChecked((c) => (e.target.checked ? [...c, id] : c.filter((x) => x !== id)))}
          />
          {LEVEL_NAMES[id] || id}
        </label>
      ))}
    </div>
  );
}

export default function SignupPage() {
  return (
    <LangProvider>
      <Wizard />
    </LangProvider>
  );
}
