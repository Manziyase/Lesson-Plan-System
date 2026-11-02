"use client";

/*
 * Daily Planner — the heart of the app. The teacher sees exactly the four
 * columns TIME | LEARNING AREA | LEARNING COMPETENCE | LESSON PROCEDURE.
 * Class is chosen per row so one daily plan covers all of the day's lessons.
 * Modes: new plan, edit (?edit=), duplicate from (?from=).
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, fmtDate, todayISO, guessTerm } from "@/lib/client";
import { useI18n } from "@/lib/i18n-client";
import { useMeta } from "@/components/Shell";
import { Spinner, useToast, SectionTitle, EmptyState, setPrintHeader } from "@/components/ui";
import { Icon } from "@/components/icons";

type Row = {
  time: string;
  classId: string;
  className: string;
  learningAreaId: string;
  learningArea: string;
  subUnit: string;
  competence: string;
  procedure: string;
};

type PlanFull = {
  id: string | null;
  teacherId: string;
  teacherName: string;
  academicYearId: string;
  date: string;
  term: number;
  rows: Row[];
};

type LessonHit = {
  id: string;
  planId: string;
  date: string;
  className: string;
  learningArea: string;
  learningAreaId: string;
  unit: string;
  competence: string;
  procedure: string;
  teacherName: string;
};

function blankRow(): Row {
  return { time: "", classId: "", className: "", learningAreaId: "", learningArea: "", subUnit: "", competence: "", procedure: "" };
}

function PlannerInner() {
  const { t, lang } = useI18n();
  const { meta } = useMeta();
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const locale = lang === "rw" ? "rw-RW" : lang === "fr" ? "fr-FR" : "en-GB";
  const isAdmin = meta.me.role === "admin";
  const year = meta.activeYear;

  /*
   * Assignment-driven choices:
   *  - admins can plan for any class and any school subject;
   *  - teachers only see the classes they are assigned to, and for each class
   *    only the subjects they teach in that class.
   */
  const myAssignments = meta.me.assignments;
  const allowedClasses = useMemo(() => {
    if (isAdmin) return meta.classes;
    const ids = new Set(myAssignments.map((a) => a.classId));
    return meta.classes.filter((c) => ids.has(c.id));
  }, [isAdmin, meta.classes, myAssignments]);

  const subjectsByClass = useMemo(() => {
    const map = new Map<string, { id: string; name: string }[]>();
    if (isAdmin) {
      for (const cls of meta.classes) map.set(cls.id, meta.subjects);
      return map;
    }
    for (const a of myAssignments) {
      const list = map.get(a.classId) ?? [];
      const subject = meta.subjects.find((s) => s.id === a.subjectId);
      if (subject && !list.some((s) => s.id === subject.id)) list.push(subject);
      map.set(a.classId, list);
    }
    for (const [classId, list] of map) {
      map.set(classId, list.slice().sort((a, b) => a.name.localeCompare(b.name)));
    }
    return map;
  }, [isAdmin, meta.classes, meta.subjects, myAssignments]);

  function subjectOptionsFor(classId: string) {
    return subjectsByClass.get(classId) ?? [];
  }

  const editParam = sp.get("edit");
  const fromParam = sp.get("from");
  const dateParam = sp.get("date");

  const [ready, setReady] = useState(false);
  const [plan, setPlan] = useState<PlanFull | null>(null);
  const [date, setDate] = useState(dateParam || todayISO());
  const [term, setTerm] = useState<number>(guessTerm());
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState("");
  const [error, setError] = useState("");
  const [showReuse, setShowReuse] = useState(false);
  const [showDup, setShowDup] = useState(false);

  /* plan year: editing keeps the plan's own year (legacy behaviour) */
  const planYear = useMemo(() => {
    if (plan?.id && plan.academicYearId) {
      return meta.years.find((y) => y.id === plan.academicYearId) ?? year;
    }
    return year;
  }, [plan, meta.years, year]);

  useEffect(() => {
    (async () => {
      try {
        if (fromParam) {
          const src = await api<{ plan: PlanFull }>(`/api/plans/${encodeURIComponent(fromParam)}`);
          const p = src.plan;
          setPlan(null); // duplicating — the copy becomes a new plan
          setDate(p.date);
          setTerm(p.term);
          setRows(p.rows.length ? p.rows.map((r) => ({ ...blankRow(), ...r })) : [blankRow()]);
        } else if (editParam) {
          const src = await api<{ plan: PlanFull }>(`/api/plans/${encodeURIComponent(editParam)}`);
          const p = src.plan;
          if (!isAdmin && p.teacherId !== meta.me.id) {
            toast(t("{name}'s plan is read-only for you — opened in reuse mode.", { name: p.teacherName }), "err");
            router.replace(`/planner?from=${p.id}`);
            return;
          }
          setPlan(p);
          setDate(p.date);
          setTerm(p.term);
          setRows(p.rows.length ? p.rows.map((r) => ({ ...blankRow(), ...r })) : [blankRow()]);
        } else if (dateParam) {
          const list = await api<{ plans: { id: string }[] }>(`/api/plans?from=${dateParam}&to=${dateParam}&mine=1`);
          if (list.plans.length) {
            const src = await api<{ plan: PlanFull }>(`/api/plans/${encodeURIComponent(list.plans[0].id)}`);
            setPlan(src.plan);
            setDate(src.plan.date);
            setTerm(src.plan.term);
            setRows(src.plan.rows.length ? src.plan.rows.map((r) => ({ ...blankRow(), ...r })) : [blankRow()]);
          }
        }
      } catch (e) {
        setError((e as Error).message);
      }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editParam, fromParam, dateParam]);

  const setRow = useCallback((i: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }, []);

  function removeRow(i: number) {
    setRows((rs) => (rs.length === 1 ? [blankRow()] : rs.filter((_, idx) => idx !== i)));
  }

  function addRow() {
    setRows((rs) => [...rs, blankRow()]);
  }

  async function save() {
    setError("");
    setSaving(true);
    setSavedNote(t("Saving…"));
    const payload = { date, term, academicYearId: planYear?.id ?? "", rows };
    try {
      if (plan?.id) {
        await api(`/api/plans/${plan.id}`, { method: "PUT", body: payload });
      } else {
        const res = await api<{ plan: { id: string; rows: number } }>("/api/plans", { method: "POST", body: payload });
        setPlan({ ...(plan ?? { id: null, teacherId: meta.me.id, teacherName: meta.me.name, academicYearId: planYear?.id ?? "", date, term, rows }), id: res.plan.id });
      }
      setSavedNote(t("Saved ✓"));
      toast(
        isAdmin
          ? t("Daily plan saved — {n} lesson(s) archived and published to the Lesson Library.", { n: rows.length })
          : t("Daily plan saved — {n} lesson(s) archived. Pending admin approval until it appears in the Lesson Library.", { n: rows.length }),
        "ok"
      );
      router.refresh();
    } catch (e) {
      setSavedNote("");
      setError((e as Error).message);
      toast((e as Error).message, "err");
    }
    setSaving(false);
  }

  async function duplicate() {
    if (!plan?.id) {
      toast(t("Save the plan first."), "err");
      return;
    }
    try {
      const res = await api<{ plan: { id: string; date: string } }>(`/api/plans/${plan.id}/duplicate`, {
        method: "POST",
        body: { date: todayISO(), term, academicYearId: year?.id ?? "" },
      });
      toast(t("Plan duplicated to {date}.", { date: res.plan.date }), "ok");
      router.push(`/planner?from=${res.plan.id}`);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  function print() {
    setPrintHeader(meta.school?.name ?? "", [
      "Daily Lesson Plan",
      "Teacher: " + meta.me.name,
      "Date: " + fmtDate(date, locale),
      "Term " + term,
      "Academic Year: " + (planYear?.label ?? "—"),
    ]);
    window.print();
  }

  if (!ready) return <Spinner />;
  const isNew = !plan?.id;

  return (
    <>
      <div className="page-header no-print">
        <div>
          <h1>{isNew ? t("New Daily Plan") : `${t("Edit Daily Plan")} — ${fmtDate(date, locale)}`}</h1>
          <div className="sub">{t("Plan all of today\u2019s lessons in one table — one row per lesson, across all your classes.")}</div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setShowReuse((s) => !s)}>
            <Icon name="refresh" size={15} /> {t("Reuse a past lesson")}
          </button>
          <button className="btn" onClick={print}>
            <Icon name="printer" size={15} /> {t("Print")}
          </button>
          {!isNew ? (
            <button className="btn" onClick={() => setShowDup((s) => !s)}>
              <Icon name="copy" size={15} /> {t("Duplicate to another date")}
            </button>
          ) : null}
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            <Icon name="check" size={15} /> {saving ? t("Saving…") : t("Save Plan")}
          </button>
        </div>
      </div>

      {error ? <div className="form-error">{error}</div> : null}
      {!isAdmin && allowedClasses.length === 0 ? (
        <div className="form-error">
          {t("You have no classes assigned yet. Ask your school administrator to assign your classes and subjects before planning.")}
        </div>
      ) : null}

      <div className="card no-print" style={{ marginBottom: 14 }}>
        <div className="planner-meta">
          <div>
            <label className="field-label">{t("Date")}</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="field-label">{t("Term")}</label>
            <select className="input" value={term} onChange={(e) => setTerm(Number(e.target.value))}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{t("Term {n}", { n })}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">{t("Academic year")}</label>
            <input className="input" value={planYear?.label ?? "—"} disabled />
          </div>
          <div>
            <label className="field-label">{t("Teacher")}</label>
            <input className="input" value={plan?.teacherId && plan.teacherId !== meta.me.id ? plan.teacherName : meta.me.name} disabled />
          </div>
        </div>
      </div>

      <div className="planner-table-wrap">
        <table className="planner">
          <thead>
            <tr>
              <th className="col-time">{t("Time")}</th>
              <th>{t("Class")}</th>
              <th className="col-area">{t("Learning Area")}</th>
              <th>{t("Sub Unit")}</th>
              <th>{t("Learning Competence / Unit")}</th>
              <th>{t("Lesson Procedure")}</th>
              <th className="no-print" style={{ width: 46 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <span className="muted no-print" style={{ fontSize: ".72rem", display: "block", textAlign: "center", marginBottom: 4 }}>
                    {t("Row")} {i + 1}
                  </span>
                  <input className="input" style={{ minWidth: 96 }} value={r.time} placeholder="08:00-08:40" onChange={(e) => setRow(i, { time: e.target.value })} />
                </td>
                <td>
                  {(() => {
                    const options = allowedClasses.slice();
                    // Keep a historical/free-text class visible when editing an
                    // older plan so the value is never silently lost.
                    const legacyValue = !r.classId && r.className ? `legacy:${r.className}` : "";
                    const byName = options.find((c) => c.name === r.className);
                    if (r.className && !options.some((c) => c.id === r.classId) && !byName) {
                      options.push({ id: r.classId || legacyValue, name: r.className, level: null, stream: null });
                    }
                    return (
                      <select
                        className="input"
                        style={{ minWidth: 110 }}
                        value={r.classId || byName?.id || legacyValue}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value.startsWith("legacy:")) return;
                          const cls = options.find((c) => c.id === value);
                          // Changing class invalidates the subject: a teacher
                          // may teach different subjects in different classes.
                          setRow(i, {
                            classId: cls ? cls.id : "",
                            className: cls ? cls.name : "",
                            learningAreaId: "",
                            learningArea: "",
                          });
                        }}
                      >
                        <option value="">{t("— class —")}</option>
                        {options.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    );
                  })()}
                </td>
                <td>
                  {(() => {
                    const options = subjectOptionsFor(r.classId);
                    return (
                      <select
                        className="input"
                        style={{ minWidth: 150 }}
                        value={r.learningAreaId}
                        disabled={!r.classId}
                        onChange={(e) => {
                          const a = options.find((x) => x.id === e.target.value);
                          setRow(i, { learningAreaId: e.target.value, learningArea: a?.name ?? "" });
                        }}
                      >
                        <option value="">{r.classId ? t("— subject —") : t("Choose a class first")}</option>
                        {options.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        {r.learningAreaId && !options.some((a) => a.id === r.learningAreaId) ? (
                          <option value={r.learningAreaId}>{r.learningArea || r.learningAreaId}</option>
                        ) : null}
                      </select>
                    );
                  })()}
                </td>
                <td>
                  <input className="input" value={r.subUnit} placeholder="Sub-unit e.g. 3.1 Fractions" onChange={(e) => setRow(i, { subUnit: e.target.value })} />
                </td>
                <td><textarea value={r.competence} placeholder="Unit X: …\nSubUnit X.Y: …" onChange={(e) => setRow(i, { competence: e.target.value })} /></td>
                <td><textarea value={r.procedure} placeholder={"Introduction…\nDevelopment…\nAssessment…"} onChange={(e) => setRow(i, { procedure: e.target.value })} /></td>
                <td className="no-print" style={{ textAlign: "center", verticalAlign: "middle" }}>
                  <button className="btn btn-sm btn-danger" title={t("Remove row")} aria-label={t("Remove row")} onClick={() => removeRow(i)}>
                    <Icon name="trash" size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "12px 4px", flexWrap: "wrap" }}>
        <button className="btn" onClick={addRow}><Icon name="plus" size={15} /> {t("Add lesson row")}</button>
        <span className="muted" style={{ fontSize: ".8rem" }}>{savedNote}</span>
      </div>

      {showReuse ? (
        <ReusePanel meta={meta} onPick={(lesson) => {
          const idx = rows.findIndex((r) => !r.competence && !r.procedure);
          const target = idx >= 0 ? idx : rows.length - 1;
          setRows((rs) => {
            const next = rs.map((r, i) => (i === target ? { ...r } : r));
            if (idx < 0) next.push(blankRow());
            const t2 = next[idx >= 0 ? target : next.length - 1];
            t2.competence = lesson.competence;
            t2.procedure = lesson.procedure;
            if (!t2.className && lesson.className) t2.className = lesson.className;
            if (!t2.learningAreaId && lesson.learningAreaId) {
              t2.learningAreaId = lesson.learningAreaId;
              t2.learningArea = lesson.learningArea;
            }
            return next;
          });
          setShowReuse(false);
          toast(t("Lesson copied into your plan — adapt it as needed."), "ok");
        }} />
      ) : null}

      {showDup ? (
        <div className="card no-print">
          <SectionTitle icon="copy">{t("Duplicate this plan")}</SectionTitle>
          <p className="muted" style={{ fontSize: ".85rem" }}>
            {t("Creates a copy owned by you on today's date with all rows; adjust times and details after saving.")}
          </p>
          <button className="btn btn-primary" onClick={duplicate}><Icon name="copy" size={15} /> {t("Create copy")}</button>
        </div>
      ) : null}
    </>
  );
}

function ReusePanel({ meta, onPick }: { meta: ReturnType<typeof useMeta>["meta"]; onPick: (l: LessonHit) => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("");
  const [area, setArea] = useState("");
  const [hits, setHits] = useState<LessonHit[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function search() {
    setBusy(true);
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (cls) p.set("class", cls);
    if (area) p.set("area", area);
    p.set("limit", "12");
    try {
      const res = await api<{ lessons: LessonHit[] }>("/api/lessons?" + p.toString());
      setHits(res.lessons);
    } catch {
      setHits([]);
    }
    setBusy(false);
  }

  return (
    <div className="card no-print">
      <SectionTitle icon="refresh">{t("Reuse a past lesson")}</SectionTitle>
      <p className="muted" style={{ fontSize: ".85rem" }}>{t("Search saved lessons school-wide. Picking one copies its competence & procedure into a row — adapt freely.")}</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
        <div style={{ flex: "2 1 220px" }}>
          <label className="field-label">{t("Search")}</label>
          <input className="input" value={q} placeholder={t("e.g. fractions, greetings, water…")} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
        </div>
        <div style={{ flex: "1 1 150px" }}>
          <label className="field-label">{t("Class")}</label>
          <select className="input" value={cls} onChange={(e) => setCls(e.target.value)}>
            <option value="">{t("All classes")}</option>
            {meta.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ flex: "1 1 150px" }}>
          <label className="field-label">{t("Learning area")}</label>
          <select className="input" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">{t("All areas")}</option>
            {meta.subjects.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" onClick={search} disabled={busy}>
          <Icon name="search" size={15} /> {t("Search")}
        </button>
      </div>
      {hits === null ? (
        <EmptyState icon="search" title={t("Search saved lessons")} sub={t("Set filters and search to see past lessons.")} />
      ) : hits.length === 0 ? (
        <EmptyState icon="search" title={t("No matching lessons found yet.")} />
      ) : (
        <div className="lib-grid">
          {hits.map((l) => (
            <div key={l.id} className="lib-card">
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                <span className="chip chip-class">{l.className}</span>
                <span className="chip chip-area">{l.learningArea}</span>
                <span className="chip chip-gray">{new Date(l.date + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
              </div>
              <div className="unit-name">{l.unit || l.competence || "Lesson"}</div>
              <div className="proc">{l.procedure}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
                <span className="muted" style={{ fontSize: ".8rem" }}>by {l.teacherName}</span>
                <button className="btn btn-sm btn-primary" onClick={() => onPick(l)} title={t("Use this lesson")} aria-label={t("Use this lesson")}><Icon name="check" size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PlannerPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <PlannerInner />
    </Suspense>
  );
}
