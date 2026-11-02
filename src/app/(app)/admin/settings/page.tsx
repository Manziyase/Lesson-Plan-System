"use client";

/* Admin view: School Settings — choose which levels and streams the school offers. */

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n-client";
import { useMeta } from "@/components/Shell";
import { SectionTitle, useToast } from "@/components/ui";
import { Icon } from "@/components/icons";

const OWNERSHIP_LABELS: Record<string, string> = {
  public: "Public",
  aided: "Government-aided",
  private: "Private",
};
const LEVEL_LABELS: Record<string, string> = {
  nursery: "Nursery",
  primary: "Primary",
  secondary: "Secondary",
  combined: "Combined",
};

function SchoolDetailsCard() {
  const { t } = useI18n();
  const { meta, refresh } = useMeta();
  const toast = useToast();
  const school = meta.school;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => ({
    name: school?.name ?? "",
    code: (school as unknown as { code?: string })?.code ?? "",
    level: (school as unknown as { level?: string })?.level ?? "",
    ownership: (school as unknown as { ownership?: string })?.ownership ?? "",
    province: (school as unknown as { province?: string })?.province ?? "",
    district: school?.district ?? "",
    sector: school?.sector ?? "",
    cell: (school as unknown as { cell?: string })?.cell ?? "",
    village: (school as unknown as { village?: string })?.village ?? "",
    address: (school as unknown as { address?: string })?.address ?? "",
    officialEmail: (school as unknown as { officialEmail?: string })?.officialEmail ?? "",
    officialPhone: (school as unknown as { officialPhone?: string })?.officialPhone ?? "",
  }));

  function f(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((s) => ({ ...s, [key]: e.target.value }));
  }

  async function save() {
    setError("");
    setBusy(true);
    try {
      await api("/api/school/info", { method: "PUT", body: form });
      toast(t("School details saved."), "ok");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  const opt = <span className="field-optional">({t("optional")})</span>;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <SectionTitle icon="school">{t("School details")}</SectionTitle>
      {error ? <div className="form-error">{error}</div> : null}
      <div className="form-grid">
        <div>
          <label className="field-label">{t("School name")} *</label>
          <input className="input" maxLength={120} value={form.name} onChange={f("name")} />
        </div>
        <div>
          <label className="field-label">{t("School code / registration number")} {opt}</label>
          <input className="input" maxLength={40} value={form.code} onChange={f("code")} />
        </div>
        <div>
          <label className="field-label">{t("School level")}</label>
          <select className="input" value={form.level} onChange={f("level")}>
            <option value="">{t("Select…")}</option>
            {Object.entries(LEVEL_LABELS).map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">{t("Ownership")}</label>
          <select className="input" value={form.ownership} onChange={f("ownership")}>
            <option value="">{t("Select…")}</option>
            {Object.entries(OWNERSHIP_LABELS).map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">{t("Province")}</label>
          <input className="input" maxLength={40} value={form.province} onChange={f("province")} />
        </div>
        <div>
          <label className="field-label">{t("District")}</label>
          <input className="input" maxLength={60} value={form.district} onChange={f("district")} />
        </div>
        <div>
          <label className="field-label">{t("Sector")}</label>
          <input className="input" maxLength={60} value={form.sector} onChange={f("sector")} />
        </div>
        <div>
          <label className="field-label">{t("Cell")} {opt}</label>
          <input className="input" maxLength={60} value={form.cell} onChange={f("cell")} />
        </div>
        <div>
          <label className="field-label">{t("Village")} {opt}</label>
          <input className="input" maxLength={60} value={form.village} onChange={f("village")} />
        </div>
        <div>
          <label className="field-label">{t("Physical address")} {opt}</label>
          <input className="input" maxLength={160} value={form.address} onChange={f("address")} />
        </div>
        <div>
          <label className="field-label">{t("Official school email")} {opt}</label>
          <input className="input" type="email" value={form.officialEmail} onChange={f("officialEmail")} />
        </div>
        <div>
          <label className="field-label">{t("School phone number")} {opt}</label>
          <input className="input" type="tel" value={form.officialPhone} onChange={f("officialPhone")} />
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          <Icon name="check" size={15} /> {busy ? t("Saving…") : t("Save changes")}
        </button>
      </div>
    </div>
  );
}

const LEVEL_GROUPS = [
  { name: "Nursery", ids: ["N1", "N2", "N3"] },
  { name: "Primary", ids: ["P1", "P2", "P3", "P4", "P5", "P6"] },
  { name: "Secondary", ids: ["S1", "S2", "S3", "S4", "S5", "S6"] },
];
const LEVEL_NAMES: Record<string, string> = {
  N1: "Nursery 1", N2: "Nursery 2", N3: "Nursery 3",
  P1: "P1", P2: "P2", P3: "P3", P4: "P4", P5: "P5", P6: "P6",
  S1: "S1", S2: "S2", S3: "S3", S4: "S4", S5: "S5", S6: "S6",
};
const STREAM_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

export default function SchoolSettingsPage() {
  const { t } = useI18n();
  const { meta, refresh } = useMeta();
  const toast = useToast();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const currentStreams = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const c of meta.classes) {
      if (c.level && c.stream) {
        (m[c.level] ??= []).push(c.stream);
      } else if (c.level) {
        m[c.level] ??= [];
      }
    }
    return m;
  }, [meta.classes]);

  const [checkedState, setCheckedState] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const g of LEVEL_GROUPS) for (const id of g.ids) {
      m[id] = meta.levels.some((l) => l.id === id) || meta.classes.some((c) => c.level === id);
    }
    return m;
  });

  const [levels, setLevels] = useState<Record<string, string[]>>(() => {
    const m: Record<string, string[]> = {};
    for (const g of LEVEL_GROUPS) for (const id of g.ids) {
      const streams = currentStreams[id];
      m[id] = streams ? Array.from(new Set(streams)) : [];
    }
    return m;
  });

  function toggleLevel(id: string, on: boolean) {
    setLevels((lv) => ({ ...lv, [id]: on ? lv[id] ?? [] : [] }));
  }
  function toggleStream(id: string, s: string) {
    setLevels((lv) => {
      const cur = lv[id] ?? [];
      return { ...lv, [id]: cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s] };
    });
  }

  const chosenLevelIds = Object.keys(checkedState).filter((k) => checkedState[k]);
  const totalClasses = chosenLevelIds.reduce((acc, id) => acc + ((levels[id] ?? []).length || 1), 0);

  async function save() {
    setError("");
    setBusy(true);
    const chosen = Object.keys(checkedState).filter((k) => checkedState[k]);
    const streamsByLevel: Record<string, string[]> = {};
    chosen.forEach((id) => {
      streamsByLevel[id] = levels[id] ?? [];
    });
    if (!chosen.length) {
      setError(t("Select at least one level."));
      setBusy(false);
      return;
    }
    try {
      await api("/api/school/classes", { method: "PUT", body: { levels: chosen, streamsByLevel } });
      toast(t("School classes saved."), "ok");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t("School Settings")}</h1>
          <div className="sub">
            {t("Choose the levels your school has, and add streams (A, B, …) where a level has several classes. Only selected classes appear anywhere in the app.")}
          </div>
        </div>
      </div>

      <SchoolDetailsCard />
      <SchoolDeletionCard />

      <div className="card">
        <SectionTitle icon="graduation">{t("Classes & streams")}</SectionTitle>
        {error ? <div className="form-error">{error}</div> : null}
        {LEVEL_GROUPS.map((g) => (
          <div key={g.name} style={{ marginBottom: 14 }}>
            <h3 style={{ margin: "8px 0", fontSize: ".92rem" }}>{t(g.name)}</h3>
            <div className="form-grid">
              {g.ids.map((id) => {
                const on = checkedState[id];
                const streams = levels[id] ?? [];
                return (
                  <div key={id} className="card" style={{ margin: 0, padding: 12 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => {
                          setCheckedState((s) => ({ ...s, [id]: e.target.checked }));
                          toggleLevel(id, e.target.checked);
                        }}
                        style={{ accentColor: "var(--color-royal-600)" }}
                      />
                      <strong>{LEVEL_NAMES[id] || id}</strong>
                    </label>
                    {on ? (
                      <div style={{ marginTop: 8 }}>
                        <div className="muted" style={{ fontSize: ".75rem", marginBottom: 6 }}>{t("Streams (leave all unchecked for a single class per level):")}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {STREAM_LETTERS.map((s) => (
                            <label key={s} className="check-pill">
                              <input type="checkbox" checked={streams.includes(s)} onChange={() => toggleStream(id, s)} /> {id}{s}
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div className="row-actions" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            <Icon name="check" size={15} /> {busy ? t("Saving…") : t("Save")}
          </button>
          <span className="muted" style={{ fontSize: ".8rem" }}>
            {t("{n} level(s) → {m} class(es)", { n: chosenLevelIds.length, m: totalClasses })}
          </span>
        </div>
      </div>
    </>
  );
}

function SchoolDeletionCard() {
  const { meta } = useMeta();
  const toast = useToast();
  const [request, setRequest] = useState<{ scheduledFor: string; graceDays: number } | null>(null);
  const [reason, setReason] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ request: typeof request }>("/api/school/deletion").then((r) => setRequest(r.request)).catch(() => {}); }, []);
  async function submit(e: React.FormEvent) { e.preventDefault(); setBusy(true); try { const r = await api<{ request: typeof request }>("/api/school/deletion", { method: "POST", body: { reason, schoolName, password } }); setRequest(r.request); setReason(""); setPassword(""); toast("Permanent deletion scheduled. You can cancel during the grace period.", "ok"); } catch (err) { toast((err as Error).message, "err"); } setBusy(false); }
  async function cancel() { setBusy(true); try { await api("/api/school/deletion", { method: "DELETE" }); setRequest(null); toast("Deletion request cancelled.", "ok"); } catch (err) { toast((err as Error).message, "err"); } setBusy(false); }
  return <section className="card danger-card"><SectionTitle icon="trash">Permanent school deletion</SectionTitle><p>This permanently removes the school workspace and its teachers, classes, subjects, plans, messages, comments, and files attached in LessonHub. A {request?.graceDays ?? 30}-day grace period applies. Platform backups follow the hosting provider's retention and purge schedule.</p>{request ? <><p><strong>Deletion scheduled:</strong> {new Date(request.scheduledFor).toLocaleString()}</p><button className="btn" disabled={busy} onClick={() => void cancel()}>Cancel pending deletion</button></> : <form onSubmit={submit}><label className="field-label">Reason for deletion</label><textarea className="input" required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /><label className="field-label">Type school name: {meta.school?.name}</label><input className="input" required value={schoolName} onChange={(e) => setSchoolName(e.target.value)} /><label className="field-label">Re-enter your password</label><input className="input" required type="password" value={password} onChange={(e) => setPassword(e.target.value)} /><button className="btn btn-danger" disabled={busy}>Request permanent deletion</button></form>}</section>;
}
