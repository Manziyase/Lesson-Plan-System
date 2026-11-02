"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Modal, Spinner, useConfirm, useToast } from "@/components/ui";
import { saApi, copyText, fmtDateTime, timeAgo, initials } from "@/lib/superadmin-client";
import { SaPageHeader, StatusChip, SectionCard } from "@/components/superadmin/ui";

type Settings = {
  name: string;
  shortName: string;
  tagline: string;
  supportEmail: string;
  logoUrl: string;
  brandColor: string;
  registration: {
    enabled: boolean;
    requireAdminApproval: boolean;
    allowedEmailDomains: string[];
    defaultCountry: string;
  };
  subscriptions: {
    enabled: boolean;
    defaultPlanCode: string;
    trialDays: number;
    currency: string;
  };
  features: {
    announcements: boolean;
    lessonLibrary: boolean;
    planner: boolean;
    analytics: boolean;
  };
  email: {
    senderName: string;
    senderEmail: string;
    replyTo: string;
    notificationsEnabled: boolean;
  };
  security: {
    sessionHours: number;
    requireMfa: boolean;
    loginAttemptsPerWindow: number;
    passwordMinLength: number;
  };
  maintenance: {
    enabled: boolean;
    message: string;
  };
};

type Plan = { id: string; code: string; name: string; isActive: boolean; isDefault: boolean };

type SettingsResponse = {
  settings: Settings;
  plans: Plan[];
  secretsConfigured: {
    smtpHost: boolean;
    smtpUser: boolean;
    smtpPassword: boolean;
    emailApiKey: boolean;
    paymentProvider: boolean;
  };
};

type AdminRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

type AdminsResponse = { admins: AdminRow[]; me: string };

type MfaSetup = { secret: string; otpauth: string; issuer: string; account: string };

const SECTION_KEYS: (keyof Settings)[] = [
  "name",
  "shortName",
  "tagline",
  "supportEmail",
  "logoUrl",
  "brandColor",
];

function SettingsSection({
  id,
  title,
  icon,
  sub,
  children,
  footer,
}: {
  id: string;
  title: string;
  icon: IconName;
  sub?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="card sa-form-section" id={id}>
      <div className="sa-card-head">
        <div className="sa-card-title">
          <span className="ico" aria-hidden="true">
            <Icon name={icon} size={16} />
          </span>
          <div>
            <h3>{title}</h3>
            {sub ? <p>{sub}</p> : null}
          </div>
        </div>
      </div>
      {children}
      {footer ? <div className="sa-actions-row">{footer}</div> : null}
    </section>
  );
}

function SaveButton({
  dirty,
  busy,
  onClick,
}: {
  dirty: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button className="btn btn-primary" onClick={onClick} disabled={busy || !dirty}>
      {busy ? <span className="sa-spin" /> : <Icon name="check" size={15} />}
      Save changes
    </button>
  );
}

export default function SettingsPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [data, setData] = useState<SettingsResponse | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");

  const [adminsData, setAdminsData] = useState<AdminsResponse | null>(null);
  const [adminsError, setAdminsError] = useState("");
  const [adminsLoading, setAdminsLoading] = useState(true);

  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState("");

  const [mfaSetup, setMfaSetup] = useState<MfaSetup | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState("");
  const [mfaPassword, setMfaPassword] = useState("");
  const [showDisableMfa, setShowDisableMfa] = useState(false);

  const [adminOpen, setAdminOpen] = useState(false);
  const [adminForm, setAdminForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminAction, setAdminAction] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await saApi<SettingsResponse>("/api/superadmin/settings");
      setData(res);
      setForm(res.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load platform settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAdmins = useCallback(async () => {
    setAdminsLoading(true);
    setAdminsError("");
    try {
      const res = await saApi<AdminsResponse>("/api/superadmin/admins");
      setAdminsData(res);
    } catch (err) {
      setAdminsError(err instanceof Error ? err.message : "Could not load super admins.");
    } finally {
      setAdminsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadAdmins();
  }, [load, loadAdmins]);

  /* Deep links from the shell banners: /superadmin/settings#account */
  useEffect(() => {
    if (!form) return;
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const timer = setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => clearTimeout(timer);
  }, [form]);

  const me = adminsData?.admins.find((a) => a.id === adminsData.me) ?? null;
  const plans = data?.plans ?? [];

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  function setNested<K extends keyof Settings>(key: K, patch: Partial<Settings[K]>) {
    setForm((f) => (f ? { ...f, [key]: { ...(f[key] as object), ...patch } } : f));
  }

  function dirty(keys: (keyof Settings)[]): boolean {
    if (!form || !data) return false;
    return keys.some((k) => JSON.stringify(form[k]) !== JSON.stringify(data.settings[k]));
  }

  async function saveSection(
    id: string,
    keys: (keyof Settings)[],
    patch: Record<string, unknown>,
    opts: { success?: string; confirmText?: string; confirmLabel?: string } = {}
  ) {
    if (opts.confirmText) {
      const ok = await confirm(opts.confirmText, opts.confirmLabel ?? "Save changes");
      if (!ok) return;
    }
    setSaving(id);
    try {
      const res = await saApi<{ settings: Settings }>("/api/superadmin/settings", {
        method: "PUT",
        body: patch,
      });
      setData((d) => (d ? { ...d, settings: res.settings } : d));
      setForm((f) => {
        if (!f) return f;
        const next = { ...f };
        for (const k of keys) {
          (next as Record<string, unknown>)[k as string] = res.settings[k];
        }
        return next;
      });
      toast(opts.success ?? "Settings saved.", "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save these settings.", "err");
    } finally {
      setSaving("");
    }
  }

  /* ---------------- section save handlers ---------------- */

  function saveBranding() {
    if (!form) return;
    void saveSection(
      "branding",
      SECTION_KEYS,
      {
        name: form.name,
        shortName: form.shortName,
        tagline: form.tagline,
        supportEmail: form.supportEmail,
        logoUrl: form.logoUrl,
        brandColor: form.brandColor,
      },
      { success: "Branding saved." }
    );
  }

  function saveRegistration() {
    if (!form) return;
    void saveSection(
      "registration",
      ["registration"],
      { registration: form.registration },
      form.registration.enabled
        ? { success: "Registration settings saved." }
        : {
            success: "Registration settings saved.",
            confirmText:
              "Turn off school registration? New schools will no longer be able to create a workspace, but existing schools keep working.",
            confirmLabel: "Turn off registration",
          }
    );
  }

  function saveSubscriptions() {
    if (!form) return;
    void saveSection(
      "subscriptions",
      ["subscriptions"],
      { subscriptions: form.subscriptions },
      form.subscriptions.enabled
        ? { success: "Subscription settings saved." }
        : {
            success: "Subscription settings saved.",
            confirmText:
              "Disable subscriptions? New schools will not receive a default plan or trial, and billing features stay dormant until re-enabled. Existing subscriptions are not changed.",
            confirmLabel: "Disable subscriptions",
          }
    );
  }

  function saveFeatures() {
    if (!form || !data) return;
    const disabled = (
      ["announcements", "lessonLibrary", "planner", "analytics"] as const
    ).filter((k) => data.settings.features[k] && !form.features[k]);
    void saveSection(
      "features",
      ["features"],
      { features: form.features },
      disabled.length
        ? {
            success: "Feature settings saved.",
            confirmText: `Disable ${disabled.join(", ")} for every school on the platform? Affected navigation and API access will be withdrawn immediately. Individual school data is never deleted.`,
            confirmLabel: "Disable features",
          }
        : { success: "Feature settings saved." }
    );
  }

  function saveEmail() {
    if (!form) return;
    void saveSection("email", ["email"], { email: form.email }, { success: "Email settings saved." });
  }

  function saveSecurity() {
    if (!form) return;
    void saveSection(
      "security",
      ["security"],
      { security: form.security },
      {
        success: "Security policy saved.",
        confirmText:
          "Apply these security policy changes to the platform? Stricter sign-in and session rules take effect for new sessions immediately.",
        confirmLabel: "Apply policy",
      }
    );
  }

  function saveMaintenance() {
    if (!form) return;
    void saveSection(
      "maintenance",
      ["maintenance"],
      { maintenance: form.maintenance },
      form.maintenance.enabled
        ? {
            success: "Maintenance mode enabled.",
            confirmText:
              "Enable maintenance mode? School users will be blocked from signing in and existing school sessions may be refused. Super admins keep access.",
            confirmLabel: "Enable maintenance",
          }
        : { success: "Maintenance settings saved." }
    );
  }

  /* ---------------- account ---------------- */

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    const min = form?.security.passwordMinLength ?? 8;
    if (pwForm.next.length < min) {
      setPwError(`New password must be at least ${min} characters.`);
      return;
    }
    if (!/[A-Za-z]/.test(pwForm.next) || !/\d/.test(pwForm.next)) {
      setPwError("New password must include at least one letter and one number.");
      return;
    }
    if (pwForm.next !== pwForm.confirm) {
      setPwError("The new password and confirmation do not match.");
      return;
    }
    setPwBusy(true);
    try {
      await saApi("/api/superadmin/auth/password", {
        method: "POST",
        body: { currentPassword: pwForm.current, newPassword: pwForm.next },
      });
      setPwForm({ current: "", next: "", confirm: "" });
      toast("Password changed. Other sessions were signed out.", "ok");
      setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Could not change your password.");
    } finally {
      setPwBusy(false);
    }
  }

  async function startMfa() {
    setMfaError("");
    setMfaBusy(true);
    try {
      const res = await saApi<MfaSetup>("/api/superadmin/auth/mfa/setup", { method: "POST" });
      setMfaSetup(res);
      setMfaCode("");
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : "Could not start MFA setup.");
    } finally {
      setMfaBusy(false);
    }
  }

  async function enableMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaSetup) return;
    setMfaError("");
    setMfaBusy(true);
    try {
      await saApi("/api/superadmin/auth/mfa/enable", {
        method: "POST",
        body: { secret: mfaSetup.secret, code: mfaCode.trim() },
      });
      toast("Multi-factor authentication enabled.", "ok");
      setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : "Could not enable MFA.");
    } finally {
      setMfaBusy(false);
    }
  }

  async function disableMfa(e: React.FormEvent) {
    e.preventDefault();
    setMfaError("");
    const ok = await confirm(
      "Turn off multi-factor authentication for your account? This reduces the protection on platform administration.",
      "Turn off MFA"
    );
    if (!ok) return;
    setMfaBusy(true);
    try {
      await saApi("/api/superadmin/auth/mfa/disable", {
        method: "POST",
        body: { password: mfaPassword },
      });
      toast("Multi-factor authentication disabled.", "ok");
      setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : "Could not disable MFA.");
    } finally {
      setMfaBusy(false);
    }
  }

  /* ---------------- super admins ---------------- */

  async function createAdmin(e: React.FormEvent) {
    e.preventDefault();
    const min = form?.security.passwordMinLength ?? 8;
    if (adminForm.password.length < min) {
      toast(`Password must be at least ${min} characters.`, "err");
      return;
    }
    if (!/[A-Za-z]/.test(adminForm.password) || !/\d/.test(adminForm.password)) {
      toast("Password must include at least one letter and one number.", "err");
      return;
    }
    if (adminForm.password !== adminForm.confirm) {
      toast("The password and confirmation do not match.", "err");
      return;
    }
    setAdminBusy(true);
    try {
      await saApi("/api/superadmin/admins", {
        method: "POST",
        body: {
          name: adminForm.name.trim(),
          email: adminForm.email.trim(),
          password: adminForm.password,
        },
      });
      toast("Super admin created. They must change the temporary password at first sign-in.", "ok");
      setAdminOpen(false);
      setAdminForm({ name: "", email: "", password: "", confirm: "" });
      await loadAdmins();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not create this super admin.", "err");
    } finally {
      setAdminBusy(false);
    }
  }

  async function toggleAdmin(row: AdminRow) {
    const disabling = row.status === "active";
    const ok = await confirm(
      disabling
        ? `Disable ${row.name} (${row.email})? Their platform sessions are revoked immediately and they cannot sign in.`
        : `Reactivate ${row.name} (${row.email})? They will be able to sign in to the platform console again.`,
      disabling ? "Disable super admin" : "Reactivate"
    );
    if (!ok) return;
    setAdminAction(row.id);
    try {
      const res = await saApi<{ revokedSessions: number }>(`/api/superadmin/admins/${row.id}`, {
        method: "PATCH",
        body: { status: disabling ? "disabled" : "active" },
      });
      toast(
        `Super admin ${disabling ? "disabled" : "reactivated"}${
          res.revokedSessions ? ` · ${res.revokedSessions} session(s) revoked` : ""
        }.`,
        "ok"
      );
      await loadAdmins();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update this account.", "err");
    } finally {
      setAdminAction("");
    }
  }

  async function copySecret(value: string, label: string) {
    const copied = await copyText(value);
    toast(copied ? `${label} copied.` : "Could not copy — select the value manually.", copied ? "ok" : "err");
  }

  if (loading && !data) {
    return (
      <div className="stack">
        <SaPageHeader title="Platform Settings" sub="Branding, registration, subscriptions and security policy." />
        <Spinner />
      </div>
    );
  }

  if (!data || !form) {
    return (
      <div className="stack">
        <SaPageHeader title="Platform Settings" sub="Branding, registration, subscriptions and security policy." />
        <div className="form-error">{error || "Platform settings could not be loaded."}</div>
        <button className="btn btn-primary" onClick={() => load()}>
          <Icon name="refresh" size={15} /> Try again
        </button>
      </div>
    );
  }

  const requireMfa = form.security.requireMfa;

  return (
    <div className="stack">
      <SaPageHeader
        title="Platform Settings"
        sub="Configuration applies to the whole platform. It never overwrites individual school settings, teacher records or lesson content."
        actions={
          <button className="btn btn-sm" onClick={() => { load(); loadAdmins(); }} disabled={loading}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
        }
      />

      {error ? <div className="form-error">{error}</div> : null}

      <div className="sa-settings-grid">
        <nav className="card sa-section-nav" aria-label="Settings sections">
          <span className="hint">Platform</span>
          <a href="#branding"><Icon name="globe" size={14} /> Branding</a>
          <a href="#registration"><Icon name="userPlus" size={14} /> Registration</a>
          <a href="#subscriptions"><Icon name="creditCard" size={14} /> Subscriptions</a>
          <a href="#features"><Icon name="layers" size={14} /> Features</a>
          <a href="#email"><Icon name="mail" size={14} /> Email</a>
          <span className="hint">Control</span>
          <a href="#security"><Icon name="shield" size={14} /> Security policy</a>
          <a href="#maintenance"><Icon name="server" size={14} /> Maintenance</a>
          <span className="hint">Your account</span>
          <a href="#account"><Icon name="lock" size={14} /> Password &amp; MFA</a>
          <a href="#admins"><Icon name="users" size={14} /> Super admins</a>
        </nav>

        <div className="stack">
          {/* ---------------- branding ---------------- */}
          <SettingsSection
            id="branding"
            title="Branding & identity"
            icon="globe"
            sub="Shown in the platform console, sign-in screens and outbound messages."
            footer={
              <SaveButton
                dirty={dirty(SECTION_KEYS)}
                busy={saving === "branding"}
                onClick={saveBranding}
              />
            }
          >
            <div className="sa-fieldset">
              <div className="sa-two">
                <div>
                  <label className="field-label">Platform name</label>
                  <input
                    className="input"
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    maxLength={80}
                  />
                  <p className="field-hint">Full name used in headings and system messages.</p>
                </div>
                <div>
                  <label className="field-label">Short name</label>
                  <input
                    className="input"
                    value={form.shortName}
                    onChange={(e) => set("shortName", e.target.value)}
                    maxLength={80}
                  />
                  <p className="field-hint">Used where space is limited, such as the sidebar.</p>
                </div>
              </div>
              <div>
                <label className="field-label">Tagline</label>
                <input
                  className="input"
                  value={form.tagline}
                  onChange={(e) => set("tagline", e.target.value)}
                  maxLength={160}
                />
              </div>
              <div className="sa-two">
                <div>
                  <label className="field-label">Support email</label>
                  <input
                    className="input"
                    type="email"
                    value={form.supportEmail}
                    onChange={(e) => set("supportEmail", e.target.value)}
                    placeholder="support@example.com"
                  />
                </div>
                <div>
                  <label className="field-label">Brand colour</label>
                  <div className="sa-inline">
                    <input
                      className="input"
                      value={form.brandColor}
                      onChange={(e) => set("brandColor", e.target.value)}
                      maxLength={7}
                      placeholder="#16246E"
                      style={{ flex: 1 }}
                    />
                    <span
                      aria-hidden="true"
                      style={{
                        width: 34,
                        height: 34,
                        flex: "0 0 34px",
                        borderRadius: 9,
                        border: "1px solid var(--color-line)",
                        background: /^#[0-9a-f]{6}$/i.test(form.brandColor)
                          ? form.brandColor
                          : "var(--color-surface-2)",
                      }}
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="field-label">Logo URL</label>
                <input
                  className="input"
                  value={form.logoUrl}
                  onChange={(e) => set("logoUrl", e.target.value)}
                  placeholder="https://… or /uploads/logo.png"
                />
                <p className="field-hint">
                  Optional. Use an absolute HTTPS address or a path served by this deployment. Leave empty to use the
                  built-in mark.
                </p>
              </div>
            </div>
          </SettingsSection>

          {/* ---------------- registration ---------------- */}
          <SettingsSection
            id="registration"
            title="Registration"
            icon="userPlus"
            sub="Control how new schools create a workspace. Existing schools are never affected."
            footer={
              <SaveButton
                dirty={dirty(["registration"])}
                busy={saving === "registration"}
                onClick={saveRegistration}
              />
            }
          >
            <div className="sa-fieldset">
              <label className="sa-switch">
                <input
                  type="checkbox"
                  checked={form.registration.enabled}
                  onChange={(e) => setNested("registration", { enabled: e.target.checked })}
                />
                <span className="track" />
                <span className="sa-switch-label">
                  Allow school registration
                  <small>When off, the public registration form is closed.</small>
                </span>
              </label>

              <label className="sa-switch">
                <input
                  type="checkbox"
                  checked={form.registration.requireAdminApproval}
                  onChange={(e) => setNested("registration", { requireAdminApproval: e.target.checked })}
                />
                <span className="track" />
                <span className="sa-switch-label">
                  Require super admin approval
                  <small>New schools wait in a pending state until a super admin activates them.</small>
                </span>
              </label>

              <div className="sa-two">
                <div>
                  <label className="field-label">Allowed email domains</label>
                  <input
                    className="input"
                    value={form.registration.allowedEmailDomains.join(", ")}
                    onChange={(e) =>
                      setNested("registration", {
                        allowedEmailDomains: e.target.value
                          .split(/[\s,]+/)
                          .map((d) => d.trim().replace(/^@/, ""))
                          .filter(Boolean),
                      })
                    }
                    placeholder="school.rw, district.gov.rw"
                  />
                  <p className="field-hint">
                    Leave empty to allow any address. Separate domains with commas; only the domain is matched.
                  </p>
                </div>
                <div>
                  <label className="field-label">Default country</label>
                  <input
                    className="input"
                    value={form.registration.defaultCountry}
                    onChange={(e) => setNested("registration", { defaultCountry: e.target.value })}
                    maxLength={60}
                  />
                </div>
              </div>
            </div>
          </SettingsSection>

          {/* ---------------- subscriptions ---------------- */}
          <SettingsSection
            id="subscriptions"
            title="Subscriptions"
            icon="creditCard"
            sub="Defaults for new schools. Pricing and limits per plan are managed under Subscriptions & Billing."
            footer={
              <SaveButton
                dirty={dirty(["subscriptions"])}
                busy={saving === "subscriptions"}
                onClick={saveSubscriptions}
              />
            }
          >
            <div className="sa-fieldset">
              <label className="sa-switch">
                <input
                  type="checkbox"
                  checked={form.subscriptions.enabled}
                  onChange={(e) => setNested("subscriptions", { enabled: e.target.checked })}
                />
                <span className="track" />
                <span className="sa-switch-label">
                  Subscriptions enabled
                  <small>New registrations receive a plan and trial according to the values below.</small>
                </span>
              </label>

              <div className="form-grid-3">
                <div>
                  <label className="field-label">Default plan</label>
                  <select
                    className="input"
                    value={form.subscriptions.defaultPlanCode}
                    onChange={(e) => setNested("subscriptions", { defaultPlanCode: e.target.value })}
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={p.code}>
                        {p.name}
                        {p.isActive ? "" : " (inactive)"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">Trial length (days)</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={365}
                    value={form.subscriptions.trialDays}
                    onChange={(e) =>
                      setNested("subscriptions", { trialDays: Number(e.target.value) || 0 })
                    }
                  />
                  <p className="field-hint">0 starts new schools on the plan immediately.</p>
                </div>
                <div>
                  <label className="field-label">Currency</label>
                  <input
                    className="input"
                    value={form.subscriptions.currency}
                    onChange={(e) => setNested("subscriptions", { currency: e.target.value.toUpperCase() })}
                    maxLength={8}
                  />
                </div>
              </div>
              <div className="sa-callout">
                <Icon name="info" size={16} />
                <span>
                  These values affect future registrations only. Existing subscriptions, payments and school limits
                  are not modified here.
                </span>
              </div>
            </div>
          </SettingsSection>

          {/* ---------------- features ---------------- */}
          <SettingsSection
            id="features"
            title="Platform features"
            icon="layers"
            sub="Withdraw a capability from every school instantly. Nothing is deleted when a feature is turned off."
            footer={
              <SaveButton
                dirty={dirty(["features"])}
                busy={saving === "features"}
                onClick={saveFeatures}
              />
            }
          >
            <div className="sa-fieldset">
              {(
                [
                  ["announcements", "Platform announcements", "Show published platform notices to schools.", "megaphone"],
                  ["lessonLibrary", "Lesson library", "Shared lesson library and saved lessons.", "book"],
                  ["planner", "Lesson planner", "Weekly and term lesson planning.", "planner"],
                  ["analytics", "Analytics", "School dashboards and progress analytics.", "chart"],
                ] as const
              ).map(([key, label, hint, icon]) => (
                <label key={key} className="sa-switch">
                  <input
                    type="checkbox"
                    checked={form.features[key]}
                    onChange={(e) => setNested("features", { [key]: e.target.checked })}
                  />
                  <span className="track" />
                  <span className="sa-switch-label">
                    <span className="sa-inline" style={{ gap: 7 }}>
                      <Icon name={icon} size={14} /> {label}
                    </span>
                    <small>{hint}</small>
                  </span>
                </label>
              ))}
            </div>
          </SettingsSection>

          {/* ---------------- email ---------------- */}
          <SettingsSection
            id="email"
            title="Email & notifications"
            icon="mail"
            sub="Sender details used by platform messages. Credentials are read from environment variables and never shown."
            footer={
              <SaveButton
                dirty={dirty(["email"])}
                busy={saving === "email"}
                onClick={saveEmail}
              />
            }
          >
            <div className="sa-fieldset">
              <div className="sa-two">
                <div>
                  <label className="field-label">Sender name</label>
                  <input
                    className="input"
                    value={form.email.senderName}
                    onChange={(e) => setNested("email", { senderName: e.target.value })}
                    maxLength={80}
                  />
                </div>
                <div>
                  <label className="field-label">Sender email</label>
                  <input
                    className="input"
                    type="email"
                    value={form.email.senderEmail}
                    onChange={(e) => setNested("email", { senderEmail: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="field-label">Reply-to email</label>
                <input
                  className="input"
                  type="email"
                  value={form.email.replyTo}
                  onChange={(e) => setNested("email", { replyTo: e.target.value })}
                />
              </div>
              <label className="sa-switch">
                <input
                  type="checkbox"
                  checked={form.email.notificationsEnabled}
                  onChange={(e) => setNested("email", { notificationsEnabled: e.target.checked })}
                />
                <span className="track" />
                <span className="sa-switch-label">
                  Send email notifications
                  <small>Only possible when SMTP or an email API is configured on the server.</small>
                </span>
              </label>

              <div>
                <span className="field-label">Server credentials (read-only)</span>
                <div className="sa-secret-status">
                  {(
                    [
                      ["SMTP host", data.secretsConfigured.smtpHost],
                      ["SMTP user", data.secretsConfigured.smtpUser],
                      ["SMTP password", data.secretsConfigured.smtpPassword],
                      ["Email API key", data.secretsConfigured.emailApiKey],
                      ["Payment provider", data.secretsConfigured.paymentProvider],
                    ] as const
                  ).map(([label, configured]) => (
                    <div key={label} className="sa-secret-row">
                      <span>{label}</span>
                      {configured ? (
                        <StatusChip status="active" label="Configured" />
                      ) : (
                        <StatusChip status="disabled" label="Not configured" />
                      )}
                    </div>
                  ))}
                </div>
                <p className="field-hint">
                  Values are never sent to the browser. Configure them as environment variables on the server.
                </p>
              </div>
            </div>
          </SettingsSection>

          {/* ---------------- security policy ---------------- */}
          <SettingsSection
            id="security"
            title="Security policy"
            icon="shield"
            sub="Applies to the platform administration layer. School sessions follow the same session-length policy."
            footer={
              <SaveButton
                dirty={dirty(["security"])}
                busy={saving === "security"}
                onClick={saveSecurity}
              />
            }
          >
            <div className="sa-fieldset">
              <label className="sa-switch">
                <input
                  type="checkbox"
                  checked={form.security.requireMfa}
                  onChange={(e) => setNested("security", { requireMfa: e.target.checked })}
                />
                <span className="track" />
                <span className="sa-switch-label">
                  Require multi-factor authentication
                  <small>When on, super admins cannot turn their own MFA off.</small>
                </span>
              </label>
              <div className="form-grid-3">
                <div>
                  <label className="field-label">Session length (hours)</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={72}
                    value={form.security.sessionHours}
                    onChange={(e) =>
                      setNested("security", { sessionHours: Number(e.target.value) || 1 })
                    }
                  />
                </div>
                <div>
                  <label className="field-label">Login attempts per window</label>
                  <input
                    className="input"
                    type="number"
                    min={3}
                    max={50}
                    value={form.security.loginAttemptsPerWindow}
                    onChange={(e) =>
                      setNested("security", { loginAttemptsPerWindow: Number(e.target.value) || 3 })
                    }
                  />
                  <p className="field-hint">Throttling lasts 15 minutes.</p>
                </div>
                <div>
                  <label className="field-label">Minimum password length</label>
                  <input
                    className="input"
                    type="number"
                    min={8}
                    max={64}
                    value={form.security.passwordMinLength}
                    onChange={(e) =>
                      setNested("security", { passwordMinLength: Number(e.target.value) || 8 })
                    }
                  />
                </div>
              </div>
              {requireMfa && !(me?.mfaEnabled ?? false) ? (
                <div className="sa-callout warn">
                  <Icon name="warning" size={16} />
                  <span>
                    MFA is required but your account does not have it enabled yet. Set it up under{" "}
                    <a href="#account">Password &amp; MFA</a>.
                  </span>
                </div>
              ) : null}
            </div>
          </SettingsSection>

          {/* ---------------- maintenance ---------------- */}
          <SettingsSection
            id="maintenance"
            title="Maintenance mode"
            icon="server"
            sub="Temporarily pause access for schools while keeping super admin access."
            footer={
              <SaveButton
                dirty={dirty(["maintenance"])}
                busy={saving === "maintenance"}
                onClick={saveMaintenance}
              />
            }
          >
            <div className="sa-fieldset">
              <label className="sa-switch">
                <input
                  type="checkbox"
                  checked={form.maintenance.enabled}
                  onChange={(e) => setNested("maintenance", { enabled: e.target.checked })}
                />
                <span className="track" />
                <span className="sa-switch-label">
                  Maintenance mode
                  <small>School users are refused at sign-in while this is on.</small>
                </span>
              </label>
              <div>
                <label className="field-label">Message shown to school users</label>
                <textarea
                  className="input"
                  rows={3}
                  value={form.maintenance.message}
                  onChange={(e) => setNested("maintenance", { message: e.target.value })}
                  maxLength={500}
                  placeholder="e.g. Scheduled maintenance: Sunday 02:00–04:00 CAT. Lesson data is safe."
                />
              </div>
            </div>
          </SettingsSection>

          {/* ---------------- account ---------------- */}
          <SettingsSection
            id="account"
            title="Your account"
            icon="lock"
            sub="Password and multi-factor authentication for the super admin currently signed in."
          >
            <div className="sa-detail-grid" style={{ marginBottom: 16 }}>
              <div className="sa-info">
                <span>Signed in as</span>
                <strong>{me ? `${me.name} · ${me.email}` : "—"}</strong>
              </div>
              <div className="sa-info">
                <span>MFA</span>
                <strong>{me?.mfaEnabled ? "Enabled" : "Not enabled"}</strong>
              </div>
              <div className="sa-info">
                <span>Last sign-in</span>
                <strong>{me?.lastLoginAt ? fmtDateTime(me.lastLoginAt) : "—"}</strong>
              </div>
            </div>

            <div className="grid-2">
              <form onSubmit={changePassword} className="sa-fieldset">
                <h4 style={{ margin: 0 }}>Change password</h4>
                {me?.mustChangePassword ? (
                  <div className="sa-callout warn">
                    <Icon name="warning" size={16} />
                    <span>You are still using a temporary password. Change it now.</span>
                  </div>
                ) : null}
                <div>
                  <label className="field-label">Current password</label>
                  <input
                    className="input"
                    type="password"
                    autoComplete="current-password"
                    value={pwForm.current}
                    onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="field-label">New password</label>
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    value={pwForm.next}
                    onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))}
                    required
                  />
                  <p className="field-hint">
                    At least {form.security.passwordMinLength} characters, with a letter and a number.
                  </p>
                </div>
                <div>
                  <label className="field-label">Confirm new password</label>
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    value={pwForm.confirm}
                    onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
                    required
                  />
                </div>
                {pwError ? <div className="form-error">{pwError}</div> : null}
                <div className="sa-actions-row" style={{ marginTop: 0 }}>
                  <button className="btn btn-primary" type="submit" disabled={pwBusy}>
                    {pwBusy ? <span className="sa-spin" /> : <Icon name="check" size={15} />}
                    Update password
                  </button>
                </div>
                <p className="field-hint">
                  Changing your password signs out every other platform session. The current session stays active.
                </p>
              </form>

              <div className="sa-fieldset">
                <h4 style={{ margin: 0 }}>Multi-factor authentication</h4>
                {me?.mfaEnabled ? (
                  <>
                    <div className="sa-callout">
                      <Icon name="checkCircle" size={16} />
                      <span>
                        TOTP authentication is active. A code from your authenticator app is required at every
                        sign-in.
                      </span>
                    </div>
                    {requireMfa ? (
                      <div className="sa-callout warn">
                        <Icon name="shield" size={16} />
                        <span>
                          Platform policy requires MFA, so it cannot be turned off while that setting is enabled.
                        </span>
                      </div>
                    ) : (
                      <>
                        <button
                          className="btn btn-danger"
                          type="button"
                          onClick={() => {
                            setMfaError("");
                            setShowDisableMfa(true);
                          }}
                        >
                          <Icon name="xCircle" size={15} /> Turn off MFA
                        </button>
                        {showDisableMfa ? (
                          <form onSubmit={disableMfa} className="sa-fieldset">
                            <div>
                              <label className="field-label">Confirm your password</label>
                              <input
                                className="input"
                                type="password"
                                autoComplete="current-password"
                                value={mfaPassword}
                                onChange={(e) => setMfaPassword(e.target.value)}
                                required
                              />
                            </div>
                            {mfaError ? <div className="form-error">{mfaError}</div> : null}
                            <div className="sa-inline">
                              <button className="btn" type="button" onClick={() => setShowDisableMfa(false)}>
                                Cancel
                              </button>
                              <button className="btn btn-danger" type="submit" disabled={mfaBusy}>
                                {mfaBusy ? <span className="sa-spin" /> : <Icon name="x" size={15} />}
                                Turn off MFA
                              </button>
                            </div>
                          </form>
                        ) : null}
                      </>
                    )}
                  </>
                ) : mfaSetup ? (
                  <form onSubmit={enableMfa} className="sa-fieldset">
                    <div className="sa-callout">
                      <Icon name="key" size={16} />
                      <span>
                        Add this account to your authenticator app using the secret below, then enter the current
                        6-digit code. The secret is shown only during setup.
                      </span>
                    </div>
                    <div>
                      <label className="field-label">Account</label>
                      <input className="input" readOnly value={mfaSetup.account} />
                    </div>
                    <div>
                      <label className="field-label">Secret (manual entry)</label>
                      <div className="sa-search" style={{ height: "auto", padding: "8px 10px" }}>
                        <input
                          readOnly
                          value={mfaSetup.secret}
                          onFocus={(e) => e.currentTarget.select()}
                          className="sa-mono"
                        />
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => copySecret(mfaSetup.secret, "Secret")}
                        >
                          <Icon name="copy" size={13} /> Copy
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="field-label">Authenticator link</label>
                      <div className="sa-search" style={{ height: "auto", padding: "8px 10px" }}>
                        <input
                          readOnly
                          value={mfaSetup.otpauth}
                          onFocus={(e) => e.currentTarget.select()}
                          className="sa-mono"
                        />
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => copySecret(mfaSetup.otpauth, "Authenticator link")}
                        >
                          <Icon name="copy" size={13} /> Copy
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="field-label">6-digit code</label>
                      <input
                        className="input sa-code-input"
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="000000"
                        required
                      />
                    </div>
                    {mfaError ? <div className="form-error">{mfaError}</div> : null}
                    <div className="sa-inline">
                      <button
                        className="btn"
                        type="button"
                        onClick={() => {
                          setMfaSetup(null);
                          setMfaError("");
                        }}
                      >
                        Cancel
                      </button>
                      <button className="btn btn-primary" type="submit" disabled={mfaBusy || mfaCode.length !== 6}>
                        {mfaBusy ? <span className="sa-spin" /> : <Icon name="check" size={15} />}
                        Verify &amp; enable
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="sa-callout warn">
                      <Icon name="shield" size={16} />
                      <span>
                        Your account is protected by a password only. Add a TOTP authenticator app for a second
                        factor.
                      </span>
                    </div>
                    {mfaError ? <div className="form-error">{mfaError}</div> : null}
                    <button className="btn btn-primary" type="button" onClick={startMfa} disabled={mfaBusy}>
                      {mfaBusy ? <span className="sa-spin" /> : <Icon name="shield" size={15} />}
                      Set up MFA
                    </button>
                  </>
                )}
              </div>
            </div>
          </SettingsSection>

          {/* ---------------- super admins ---------------- */}
          <SectionCard
            title="Super admins"
            icon="users"
            action={
              <button className="btn btn-sm btn-primary" onClick={() => setAdminOpen(true)}>
                <Icon name="plus" size={14} /> New super admin
              </button>
            }
          >
            <div id="admins" className="sa-form-section" />
            {adminsError ? <div className="form-error">{adminsError}</div> : null}
            {adminsLoading && !adminsData ? (
              <Spinner />
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Administrator</th>
                      <th>MFA</th>
                      <th>Last sign-in</th>
                      <th>Created</th>
                      <th>Status</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {(adminsData?.admins ?? []).map((row) => {
                      const self = row.id === adminsData?.me;
                      return (
                        <tr key={row.id}>
                          <td>
                            <div className="sa-school-cell">
                              <span className={"sa-avatar" + (self ? " gold" : "")}>{initials(row.name)}</span>
                              <span className="sa-cell-main">
                                <strong>
                                  {row.name}
                                  {self ? <span className="sa-tag gold" style={{ marginLeft: 8 }}>You</span> : null}
                                </strong>
                                <span>{row.email}</span>
                                {row.mustChangePassword ? <span>Temporary password</span> : null}
                              </span>
                            </div>
                          </td>
                          <td>
                            {row.mfaEnabled ? (
                              <StatusChip status="active" label="Enabled" />
                            ) : (
                              <StatusChip status="disabled" label="Off" />
                            )}
                          </td>
                          <td>
                            <span className="sa-row-title">
                              {row.lastLoginAt ? timeAgo(row.lastLoginAt) : "Never"}
                            </span>
                            <div className="sa-row-sub">
                              {row.lastLoginAt ? fmtDateTime(row.lastLoginAt) : "No sign-in recorded"}
                            </div>
                          </td>
                          <td>
                            <span className="sa-row-title">{fmtDateTime(row.createdAt)}</span>
                          </td>
                          <td>
                            <StatusChip status={row.status} />
                          </td>
                          <td>
                            <div className="sa-table-actions">
                              {self ? (
                                <span className="sa-row-sub">Current account</span>
                              ) : row.status === "active" ? (
                                <button
                                  className="btn btn-sm btn-danger"
                                  onClick={() => toggleAdmin(row)}
                                  disabled={adminAction === row.id}
                                >
                                  <Icon name="user" size={13} /> Disable
                                </button>
                              ) : (
                                <button
                                  className="btn btn-sm btn-primary"
                                  onClick={() => toggleAdmin(row)}
                                  disabled={adminAction === row.id}
                                >
                                  <Icon name="play" size={13} /> Reactivate
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="sa-note">
              Super admins are completely separate from school administrators and teachers. At least one active super
              admin must always remain, and every change is written to the audit log.
            </p>
          </SectionCard>
        </div>
      </div>

      {/* ---------------- create super admin ---------------- */}
      {adminOpen ? (
        <Modal title="New super admin" onClose={() => setAdminOpen(false)} maxWidth={540}>
          <form onSubmit={createAdmin} className="stack" style={{ gap: 14 }}>
            <div className="sa-callout">
              <Icon name="shield" size={16} />
              <span>
                This account can manage every school, subscription and platform setting. Create it only for trusted
                platform operators.
              </span>
            </div>
            <div>
              <label className="field-label">Full name</label>
              <input
                className="input"
                value={adminForm.name}
                onChange={(e) => setAdminForm((f) => ({ ...f, name: e.target.value }))}
                maxLength={80}
                required
              />
            </div>
            <div>
              <label className="field-label">Email address</label>
              <input
                className="input"
                type="email"
                value={adminForm.email}
                onChange={(e) => setAdminForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div className="sa-two">
              <div>
                <label className="field-label">Temporary password</label>
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={adminForm.password}
                  onChange={(e) => setAdminForm((f) => ({ ...f, password: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="field-label">Confirm password</label>
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={adminForm.confirm}
                  onChange={(e) => setAdminForm((f) => ({ ...f, confirm: e.target.value }))}
                  required
                />
              </div>
            </div>
            <p className="field-hint">
              At least {form.security.passwordMinLength} characters with a letter and a number. The new super admin
              must change this password at first sign-in.
            </p>
            <div className="modal__actions">
              <button type="button" className="btn" onClick={() => setAdminOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={adminBusy}>
                {adminBusy ? <span className="sa-spin" /> : <Icon name="userPlus" size={15} />}
                Create super admin
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
