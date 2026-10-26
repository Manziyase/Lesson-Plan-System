"use client";

/*
 * School Admin Registration — creates a separate school workspace plus its
 * School Administrator. One clean page: "Administrator details" and "School
 * details" sections; required fields are labelled, optional ones say
 * "(optional)". On success the new admin is signed in and lands on the
 * dashboard of their new workspace.
 */

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { LangSelect, useI18n } from "@/lib/i18n-client";
import { LangProvider } from "@/lib/i18n-client";
import { ThemeToggle } from "@/lib/theme";
import { Icon } from "@/components/icons";

const SCHOOL_LEVEL_LABELS: Record<string, string> = {
  nursery: "Nursery",
  primary: "Primary",
  secondary: "Secondary",
  combined: "Combined (e.g. GS with Nursery+Primary+Secondary)",
};
const OWNERSHIP_LABELS: Record<string, string> = {
  public: "Public",
  aided: "Government-aided",
  private: "Private",
};

function RegisterForm() {
  const { t, lang, setLang } = useI18n();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [admin, setAdmin] = useState({ name: "", email: "", phone: "", password: "", passwordConfirm: "" });
  const [school, setSchool] = useState({
    name: "",
    code: "",
    level: "",
    ownership: "",
    province: "",
    district: "",
    sector: "",
    cell: "",
    village: "",
    address: "",
    officialEmail: "",
    officialPhone: "",
  });

  function adminField(key: keyof typeof admin) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setAdmin((a) => ({ ...a, [key]: e.target.value }));
  }
  function schoolField(key: keyof typeof school) {
    return (
      e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => setSchool((s) => ({ ...s, [key]: e.target.value }));
  }

  function clientValidate(): string {
    if (!admin.name.trim()) return t("Your full name is required.");
    if (!admin.email.trim()) return t("A valid email address is required.");
    if (!admin.phone.trim()) return t("Your phone number is required.");
    if (admin.password.length < 8 || !/[A-Za-z]/.test(admin.password) || !/[0-9]/.test(admin.password))
      return t("Password must be at least 8 characters and include a letter and a number.");
    if (admin.password !== admin.passwordConfirm) return t("Passwords do not match.");
    if (!school.name.trim()) return t("School name is required.");
    if (!school.level) return t("Please choose the school level.");
    if (!school.ownership) return t("Please choose the ownership type.");
    return "";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const local = clientValidate();
    if (local) {
      setError(local);
      return;
    }
    setError("");
    setBusy(true);
    try {
      await api("/api/auth/register", {
        method: "POST",
        body: { admin: { ...admin, language: lang }, school: { ...school, code: school.code.trim() } },
      });
      window.location.href = "/dashboard";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ maxWidth: 560 }}>
        <div style={{ textAlign: "center", marginBottom: 16, position: "relative" }}>
          <div className="auth-logo">
            <Icon name="book" size={28} />
          </div>
          <h1 className="auth-title" style={{ fontSize: "1.25rem", margin: "0 0 2px" }}>{t("Register your school")}</h1>
          <p className="auth-sub">{t("Create a School Administrator account and a private workspace for your school.")}</p>
          <div style={{ position: "absolute", top: -6, right: -6 }}>
            <ThemeToggle />
          </div>
        </div>

        <div className="auth-panel">
          {error ? <div className="form-error">{error}</div> : null}
          <form onSubmit={onSubmit} noValidate>
            {/* -------- administrator details -------- */}
            <h2 className="section-title" style={{ fontSize: ".95rem" }}>
              <span className="ico" aria-hidden="true"><Icon name="userCircle" size={15} /></span>
              {t("Administrator details")}
            </h2>

            <div style={{ marginBottom: 12 }}>
              <label className="field-label" htmlFor="reg-name">{t("Full name")} *</label>
              <input className="input" id="reg-name" autoComplete="name" maxLength={80} value={admin.name} onChange={adminField("name")} />
            </div>
            <div className="form-grid-2" style={{ marginBottom: 12 }}>
              <div>
                <label className="field-label" htmlFor="reg-email">{t("Email address")} *</label>
                <input className="input" id="reg-email" type="email" autoComplete="username" placeholder="you@school.rw" value={admin.email} onChange={adminField("email")} />
              </div>
              <div>
                <label className="field-label" htmlFor="reg-phone">{t("Phone number")} *</label>
                <input className="input" id="reg-phone" type="tel" autoComplete="tel" placeholder="+250 788 000 000" value={admin.phone} onChange={adminField("phone")} />
              </div>
            </div>
            <div className="form-grid-2" style={{ marginBottom: 16 }}>
              <div>
                <label className="field-label" htmlFor="reg-password">{t("Password")} *</label>
                <input className="input" id="reg-password" type="password" autoComplete="new-password" value={admin.password} onChange={adminField("password")} />
              </div>
              <div>
                <label className="field-label" htmlFor="reg-password2">{t("Confirm password")} *</label>
                <input className="input" id="reg-password2" type="password" autoComplete="new-password" value={admin.passwordConfirm} onChange={adminField("passwordConfirm")} />
              </div>
            </div>
            <p className="muted" style={{ fontSize: ".74rem", margin: "-8px 0 16px" }}>
              {t("Password must be at least 8 characters and include a letter and a number.")}
            </p>

            <hr style={{ border: "none", borderTop: "1px solid var(--color-line-soft)", margin: "0 0 16px" }} />

            {/* -------- school details -------- */}
            <h2 className="section-title" style={{ fontSize: ".95rem" }}>
              <span className="ico" aria-hidden="true"><Icon name="school" size={15} /></span>
              {t("School details")}
            </h2>

            <div className="form-grid-2" style={{ marginBottom: 12 }}>
              <div>
                <label className="field-label" htmlFor="reg-sname">{t("School name")} *</label>
                <input className="input" id="reg-sname" maxLength={120} placeholder={t("e.g. GS Kanyinya")} value={school.name} onChange={schoolField("name")} />
              </div>
              <div>
                <label className="field-label" htmlFor="reg-scode">{t("School code / registration number")} <span className="field-optional">({t("optional")})</span></label>
                <input className="input" id="reg-scode" maxLength={40} value={school.code} onChange={schoolField("code")} />
              </div>
            </div>
            <div className="form-grid-2" style={{ marginBottom: 12 }}>
              <div>
                <label className="field-label" htmlFor="reg-level">{t("School level")} *</label>
                <select className="input" id="reg-level" value={school.level} onChange={schoolField("level")}>
                  <option value="">{t("Select…")}</option>
                  {Object.entries(SCHOOL_LEVEL_LABELS).map(([id, label]) => (
                    <option key={id} value={id}>{t(label)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="reg-own">{t("Ownership")} *</label>
                <select className="input" id="reg-own" value={school.ownership} onChange={schoolField("ownership")}>
                  <option value="">{t("Select…")}</option>
                  {Object.entries(OWNERSHIP_LABELS).map(([id, label]) => (
                    <option key={id} value={id}>{t(label)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-grid-3" style={{ marginBottom: 12 }}>
              <div>
                <label className="field-label" htmlFor="reg-province">{t("Province")} *</label>
                <input className="input" id="reg-province" maxLength={40} placeholder={t("e.g. Kigali")} value={school.province} onChange={schoolField("province")} />
              </div>
              <div>
                <label className="field-label" htmlFor="reg-district">{t("District")} *</label>
                <input className="input" id="reg-district" maxLength={60} placeholder={t("e.g. Nyarugenge")} value={school.district} onChange={schoolField("district")} />
              </div>
              <div>
                <label className="field-label" htmlFor="reg-sector">{t("Sector")} *</label>
                <input className="input" id="reg-sector" maxLength={60} placeholder={t("e.g. Kanyinya")} value={school.sector} onChange={schoolField("sector")} />
              </div>
            </div>
            <div className="form-grid-2" style={{ marginBottom: 12 }}>
              <div>
                <label className="field-label" htmlFor="reg-cell">{t("Cell")} <span className="field-optional">({t("optional")})</span></label>
                <input className="input" id="reg-cell" maxLength={60} value={school.cell} onChange={schoolField("cell")} />
              </div>
              <div>
                <label className="field-label" htmlFor="reg-village">{t("Village")} <span className="field-optional">({t("optional")})</span></label>
                <input className="input" id="reg-village" maxLength={60} value={school.village} onChange={schoolField("village")} />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="field-label" htmlFor="reg-address">{t("Physical address")} <span className="field-optional">({t("optional")})</span></label>
              <input className="input" id="reg-address" maxLength={160} placeholder={t("Street, road or landmark")} value={school.address} onChange={schoolField("address")} />
            </div>
            <div className="form-grid-2" style={{ marginBottom: 18 }}>
              <div>
                <label className="field-label" htmlFor="reg-semail">{t("Official school email")} <span className="field-optional">({t("optional")})</span></label>
                <input className="input" id="reg-semail" type="email" placeholder="info@school.rw" value={school.officialEmail} onChange={schoolField("officialEmail")} />
              </div>
              <div>
                <label className="field-label" htmlFor="reg-sphone">{t("School phone number")} <span className="field-optional">({t("optional")})</span></label>
                <input className="input" id="reg-sphone" type="tel" placeholder="+250 788 000 000" value={school.officialPhone} onChange={schoolField("officialPhone")} />
              </div>
            </div>

            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              <Icon name="school" size={15} />
              {busy ? t("Creating your workspace…") : t("Create school workspace")}
            </button>
          </form>

          <p className="muted" style={{ fontSize: ".74rem", margin: "12px 0 0", textAlign: "center" }}>
            {t("Fields marked * are required. Everything else can be completed later in School Settings.")}
          </p>
        </div>

        <div className="auth-footer" style={{ display: "flex", justifyContent: "space-between", marginTop: 14, flexWrap: "wrap", gap: 8 }}>
          <span>
            {t("Already have an account?")} <Link href="/login">{t("Sign in")}</Link>
          </span>
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <LangSelect value={lang} onChange={setLang} className="input" />
            <ThemeToggle />
          </span>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <LangProvider>
      <RegisterForm />
    </LangProvider>
  );
}
