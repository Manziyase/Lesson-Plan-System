"use client";

/*
 * Calendar — month view across the active academic year. Each day shows the
 * daily plans recorded for it (teachers see their own; admins see the whole
 * school). Clicking a plan opens it; clicking an empty day starts a new
 * plan in the Daily Planner for that date. Data comes from the existing
 * /api/plans range query (from/to/year), so school separation and RBAC are
 * the same as everywhere else.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, fmtDateShort } from "@/lib/client";
import { useI18n } from "@/lib/i18n-client";
import { useMeta } from "@/components/Shell";
import { Spinner, Chip } from "@/components/ui";
import { Icon } from "@/components/icons";

type PlanLite = {
  id: string;
  date: string;
  term: number;
  status: string;
  teacherName: string;
  teacherId: string;
  classes: string[];
  rows: number;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function CalendarInner() {
  const { t, lang } = useI18n();
  const { meta } = useMeta();
  const router = useRouter();
  const sp = useSearchParams();
  const isAdmin = meta.me.role === "admin";
  const locale = lang === "rw" ? "rw-RW" : lang === "fr" ? "fr-FR" : "en-GB";

  const initial = sp.get("date") || "";
  const [cursor, setCursor] = useState(() => {
    const today = new Date();
    if (/^\d{4}-\d{2}-\d{2}$/.test(initial)) {
      const [y, m] = initial.split("-").map(Number);
      return { y, m0: m - 1 };
    }
    return { y: today.getFullYear(), m0: today.getMonth() };
  });
  const [plans, setPlans] = useState<PlanLite[] | null>(null);

  const range = useMemo(() => {
    const first = new Date(Date.UTC(cursor.y, cursor.m0, 1));
    const last = new Date(Date.UTC(cursor.y, cursor.m0 + 1, 0));
    return { from: ymd(Number(first.getUTCFullYear()), first.getUTCMonth(), first.getUTCDate()), to: ymd(Number(last.getUTCFullYear()), last.getUTCMonth(), last.getUTCDate()) };
  }, [cursor]);

  // Monday-first grid of 6 weeks covering the month.
  const cells = useMemo(() => {
    const firstDay = new Date(Date.UTC(cursor.y, cursor.m0, 1));
    const lead = (firstDay.getUTCDay() + 6) % 7; // Mon=0
    const daysInMonth = new Date(Date.UTC(cursor.y, cursor.m0 + 1, 0)).getUTCDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(ymd(cursor.y, cursor.m0, d));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  useEffect(() => {
    const qs = new URLSearchParams({ from: range.from, to: range.to, year: meta.activeYear?.id ?? "" });
    if (!isAdmin) qs.set("mine", "1");
    setPlans(null);
    api<{ plans: { id: string; date: string; term: number; status: string; teacherName: string; teacherId: string; rows: { className: string; classId: string }[] }[] }>(`/api/plans?${qs.toString()}`)
      .then((res) =>
        setPlans(
          res.plans.map((p) => ({
            id: p.id,
            date: p.date,
            term: p.term,
            status: p.status,
            teacherName: p.teacherName,
            teacherId: p.teacherId,
            classes: Array.from(new Set(p.rows.map((r) => r.className).filter(Boolean))),
            rows: p.rows.length,
          }))
        )
      )
      .catch(() => setPlans([]));
  }, [range.from, range.to, meta.activeYear?.id, isAdmin]);

  const byDate = useMemo(() => {
    const map = new Map<string, PlanLite[]>();
    for (const p of plans ?? []) {
      const list = map.get(p.date) ?? [];
      list.push(p);
      map.set(p.date, list);
    }
    return map;
  }, [plans]);

  const todayISO = new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
  const monthLabel = new Date(Date.UTC(cursor.y, cursor.m0, 1)).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => t(d));
  const monthTotal = plans?.length ?? 0;

  function shift(delta: number) {
    setCursor((c) => {
      const next = new Date(Date.UTC(c.y, c.m0 + delta, 1));
      return { y: next.getUTCFullYear(), m0: next.getUTCMonth() };
    });
    setPlans(null);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t("Calendar")}</h1>
          <div className="sub">
            {meta.activeYear ? t("Academic year {y}", { y: meta.activeYear.label }) + " · " : ""}
            {isAdmin ? t("Daily plans for the whole school — click a plan to open it, or a day to plan it.") : t("Your daily plans — click a plan to open it, or a day to plan it.")}
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => shift(-1)} aria-label={t("Previous month")}>
            <Icon name="chevronsLeft" size={15} /> {t("Previous")}
          </button>
          <button
            className="btn"
            onClick={() => {
              const d = new Date();
              setCursor({ y: d.getFullYear(), m0: d.getMonth() });
            }}
          >
            {t("Today")}
          </button>
          <button className="btn" onClick={() => shift(1)} aria-label={t("Next month")}>
            {t("Next")} <Icon name="chevronsRight" size={15} />
          </button>
          <Link href="/planner" className="btn btn-primary">
            <Icon name="plus" size={15} /> {t("New Daily Plan")}
          </Link>
        </div>
      </div>

      <div className="card no-print" style={{ padding: "12px 16px", marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{ fontSize: "1rem", minWidth: 170 }}>{monthLabel}</strong>
        <span className="muted" style={{ fontSize: ".85rem" }}>
          {monthTotal} {t("daily plan(s)")}
        </span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {isAdmin ? (
            <>
              <Chip kind="ok" text={t("Published")} />
              <Chip kind="warn" text={t("Pending Approval")} />
            </>
          ) : (
            <>
              <Chip kind="warn" text={t("Pending Approval")} />
              <span className="muted" style={{ fontSize: ".8rem" }}>{t("Pending plans appear in the shared library once approved.")}</span>
            </>
          )}
        </span>
      </div>

      <div className="card" style={{ padding: 12, overflow: "hidden" }}>
        <div className="cal-grid">
          {weekDays.map((d) => (
            <div className="cal-dow" key={d}>
              {d}
            </div>
          ))}
          {cells.map((iso, i) =>
            iso === null ? (
              <div className="cal-cell cal-out" key={"x" + i} aria-hidden="true" />
            ) : (
              <div className={"cal-cell" + (iso === todayISO ? " cal-today" : "")} key={iso}>
                <div className="cal-day">{Number(iso.slice(8, 10))}</div>
                <div className="cal-plans">
                  {(byDate.get(iso) ?? []).slice(0, 3).map((p) => (
                    <Link
                      key={p.id}
                      href={`/plans/${p.id}`}
                      title={`${fmtDateShort(p.date, locale)} · ${p.teacherName} · ${(p.classes || []).join(", ")}`}
                      className={"cal-plan" + (p.status === "pending" ? " cal-plan-pending" : "")}
                    >
                      <span className="cal-plan-time">{isAdmin ? p.teacherName.split(" ")[0] : (p.classes[0] ?? "—")}</span>
                      <span className="cal-plan-rows">{p.rows}</span>
                    </Link>
                  ))}
                  {(byDate.get(iso)?.length ?? 0) > 3 ? <span className="cal-more">+{(byDate.get(iso) as PlanLite[]).length - 3}</span> : null}
                </div>
                {!(byDate.get(iso) ?? []).length ? (
                  <button className="cal-add" onClick={() => router.push(`/planner?date=${iso}`)} title={t("Plan this day")}>
                    +
                  </button>
                ) : null}
              </div>
            )
          )}
        </div>
      </div>
    </>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <CalendarInner />
    </Suspense>
  );
}
