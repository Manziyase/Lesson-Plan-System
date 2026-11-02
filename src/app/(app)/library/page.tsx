"use client";

/* Lesson Library: structured lesson records with search, filters and unit browsing. */

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, fmtDateShort } from "@/lib/client";
import { useI18n } from "@/lib/i18n-client";
import { useMeta } from "@/components/Shell";
import { Spinner, EmptyState, TermChip, Chip, useToast } from "@/components/ui";
import { Icon } from "@/components/icons";

type Lesson = {
  id: string;
  planId: string;
  teacherId: string;
  teacherName: string;
  term: number;
  date: string;
  status: string;
  className: string;
  learningArea: string;
  unit: string;
  subUnit: string;
  teachingStatus: string;
  competence: string;
  procedure: string;
};

type Unit = {
  unit: string;
  slug: string;
  count: number;
  areas: string[];
  classes: string[];
  teachers: string[];
  lastTaught: string;
  subUnits: { title: string; count: number; completed: number }[];
};

function LibraryInner() {
  const { t, lang } = useI18n();
  const { meta } = useMeta();
  const toast = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const locale = lang === "rw" ? "rw-RW" : lang === "fr" ? "fr-FR" : "en-GB";
  const isAdmin = meta.me.role === "admin";

  const [filters, setFilters] = useState({
    q: sp.get("q") || "",
    class: sp.get("class") || "",
    area: sp.get("area") || "",
    term: sp.get("term") || "",
    teacher: sp.get("teacher") || "",
    unit: sp.get("unit") || "",
    subUnit: sp.get("subUnit") || "",
    mine: sp.get("mine") ?? "",
  });
  const view = sp.get("view") || "lessons";
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [total, setTotal] = useState(0);
  const [subUnits, setSubUnits] = useState<string[]>([]);
  const [unitOptions, setUnitOptions] = useState<string[]>([]);
  const [progressById, setProgressById] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    qs.set("year", meta.activeYear?.id ?? "");
    Object.entries(filters).forEach(([k, v]) => {
      if (v) qs.set(k, v);
    });
    setLessons(null);
    setUnits(null);
    try {
      if (view === "units") {
        const res = await api<{ units: Unit[] }>("/api/lessons/units?" + qs.toString());
        setUnits(res.units);
      } else {
        const res = await api<{ lessons: Lesson[]; total: number; subUnits: string[]; unitOptions: string[] }>("/api/lessons?" + qs.toString());
        setLessons(res.lessons);
        setTotal(res.total);
        setSubUnits(res.subUnits ?? []);
        setUnitOptions(res.unitOptions ?? []);
      }
    } catch {
      setLessons([]);
      setUnits([]);
    }
  }, [filters, view, meta.activeYear?.id]);

  useEffect(() => {
    load();
  }, [load]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const qs = new URLSearchParams();
    qs.set("view", view);
    Object.entries(filters).forEach(([k, v]) => {
      if (v) qs.set(k, v);
    });
    router.replace("/library?" + qs.toString());
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t("Lesson Library")}</h1>
          <div className="sub">
            {filters.mine === "1"
              ? t("Lessons you have planned — find and reuse your best work. Those still pending admin approval are marked below.")
              : t("Every lesson planned in your school, structured and searchable.")}
          </div>
        </div>
        <div className="actions">
          <Link className={"btn" + (view === "units" ? " btn-primary" : "")} href={`/library?view=units${filtersUrl(filters)}`}>
            <Icon name="layers" size={15} /> {t("By Unit")}
          </Link>
          <Link className={"btn" + (view !== "units" ? " btn-primary" : "")} href={`/library?view=lessons${filtersUrl(filters)}`}>
            <Icon name="book" size={15} /> {t("All Lessons")}
          </Link>
        </div>
      </div>

      <form className="filters no-print" onSubmit={submit}>
        <div className="grow">
          <label className="field-label">{t("Search")}</label>
          <input className="input" value={filters.q} placeholder={t("unit, competence, procedure…")} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        </div>
        <div>
          <label className="field-label">{t("Unit")}</label>
          <select className="input" value={filters.unit} onChange={(e) => setFilters({ ...filters, unit: e.target.value, subUnit: "" })}>
            <option value="">{t("All")}</option>
            {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">{t("Sub-unit")}</label>
          <select className="input" value={filters.subUnit} onChange={(e) => setFilters({ ...filters, subUnit: e.target.value })}>
            <option value="">{t("All")}</option>
            {subUnits.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">{t("Class")}</label>
          <select className="input" value={filters.class} onChange={(e) => setFilters({ ...filters, class: e.target.value })}>
            <option value="">{t("All")}</option>
            {meta.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">{t("Learning area")}</label>
          <select className="input" value={filters.area} onChange={(e) => setFilters({ ...filters, area: e.target.value })}>
            <option value="">{t("All")}</option>
            {meta.subjects.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">{t("Term")}</label>
          <select className="input" value={filters.term} onChange={(e) => setFilters({ ...filters, term: e.target.value })}>
            <option value="">{t("All")}</option>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{t("Term {n}", { n })}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">{t("Scope")}</label>
          <select className="input" value={filters.mine} onChange={(e) => setFilters({ ...filters, mine: e.target.value })}>
            <option value="">{t("Whole school")}</option>
            <option value="1">{t("Only my lessons")}</option>
          </select>
        </div>
        {isAdmin ? (
          <div>
            <label className="field-label">{t("Teacher")}</label>
            <select className="input" value={filters.teacher} onChange={(e) => setFilters({ ...filters, teacher: e.target.value })}>
              <option value="">{t("All")}</option>
              {meta.teachers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        ) : null}
        <div className="btns">
          <button className="btn btn-primary" type="submit"><Icon name="filter" size={15} /> {t("Filter")}</button>
          <Link className="btn" href={`/library?view=${view}`}><Icon name="reset" size={15} /> {t("Reset")}</Link>
        </div>
      </form>

      {view === "units" ? (
        units === null ? (
          <Spinner />
        ) : units.length === 0 ? (
          <EmptyState icon="layers" title={t("No units yet")} sub={t("Plan a lesson and its unit will appear here.")} />
        ) : (
          <div className="lib-grid">
            {units.map((u) => (
              <div key={u.slug ?? u.unit} className="lib-card">
                <div className="unit-name">{u.unit}</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {u.areas.slice(0, 2).map((a) => <Chip key={a} text={a} kind="area" />)}
                  {u.classes.slice(0, 2).map((c) => <Chip key={c} text={c} kind="class" />)}
                </div>
                <div className="muted" style={{ fontSize: ".78rem" }}>
                  {u.count} {t("lesson(s)")} · {t("last taught")} {fmtDateShort(u.lastTaught, locale)}
                  {u.teachers.length ? ` · ${u.teachers.length === 1 ? u.teachers[0] : t("{n} teachers", { n: u.teachers.length })}` : ""}
                </div>
                <div className="unit-progress-list">{u.subUnits.map((s) => <div key={s.title}><span>{s.title}</span><span className="muted">{s.completed}/{s.count} {t("completed")}</span></div>)}</div>
                <div style={{ marginTop: "auto", paddingTop: 8 }}>
                  <Link className="btn btn-sm" href={`/library?view=lessons&unit=${encodeURIComponent(u.unit)}`} title={t("View lessons")} aria-label={t("View lessons")}>
                    <Icon name="eye" size={14} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )
      ) : lessons === null ? (
        <Spinner />
      ) : lessons.length === 0 ? (
        <EmptyState icon="search" title={t("No lessons found")} sub={t("Adjust the filters or plan a new daily lesson.")} />
      ) : (
        <>
          <p className="muted" style={{ fontSize: ".85rem", margin: "0 0 10px" }}>
            {t("{n} lesson(s)", { n: total })}{filters.unit ? ` — ${filters.unit}` : ""}
          </p>
          <div className="lib-grid">
            {lessons.map((l) => {
              const mine = l.teacherId === meta.me.id;
              return (
                <div key={l.id} className="lib-card">
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    <Chip text={l.className} kind="class" />
                    <Chip text={l.learningArea} kind="area" />
                    <TermChip term={l.term} />
                    <Chip text={fmtDateShort(l.date, locale)} kind="gray" />
                    {mine ? (
                      l.status === "published"
                        ? <Chip text={t("Approved")} kind="ok" />
                        : <Chip text={t("Pending approval")} kind="warn" />
                    ) : null}
                  </div>
                  <div className="unit-name">{l.unit || l.competence || t("Lesson")}</div>
                  {l.subUnit ? <div className="lesson-subunit">{l.subUnit}</div> : null}
                  {(isAdmin || mine) ? <label className="lesson-progress">{t("Lesson status")}<select className="input" value={progressById[l.id] ?? l.teachingStatus ?? "planned"} onChange={async (e) => { const teachingStatus = e.target.value; setProgressById((p) => ({ ...p, [l.id]: teachingStatus })); try { await api(`/api/lessons/${encodeURIComponent(l.id)}/progress`, { method: "PATCH", body: { teachingStatus } }); } catch (error) { setProgressById((p) => ({ ...p, [l.id]: l.teachingStatus })); toast((error as Error).message, "err"); } }}><option value="planned">{t("Planned")}</option><option value="completed">{t("Completed")}</option></select></label> : <Chip text={l.teachingStatus === "completed" ? t("Completed") : t("Planned")} kind={l.teachingStatus === "completed" ? "ok" : "gray"} />}
                  <div className="proc">{l.procedure}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: 8 }}>
                    <span className="muted" style={{ fontSize: ".8rem" }}>{mine ? t("You") : t("by {name}", { name: l.teacherName || t("Unknown") })}</span>
                    <span style={{ display: "flex", gap: 6 }}>
                      <Link className="btn btn-sm" href={`/lessons/${l.id}`} title={t("View")} aria-label={t("View")}><Icon name="eye" size={14} /></Link>
                      {isAdmin || mine ? (
                        <Link className="btn btn-sm btn-primary" href={`/planner?edit=${l.planId}`} title={t("Edit")} aria-label={t("Edit")}><Icon name="pencil" size={14} /></Link>
                      ) : null}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function filtersUrl(f: Record<string, string>): string {
  const qs = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => {
    if (v) qs.set(k, v);
  });
  const s = qs.toString();
  return s ? "&" + s : "";
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <LibraryInner />
    </Suspense>
  );
}
