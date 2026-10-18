"use client";

/* Dashboard: stats, per-class/area breakdown, activity, recent plans. */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, fmtDateShort } from "@/lib/client";
import { useI18n } from "@/lib/i18n-client";
import { TermChip, Spinner, SectionTitle, useToast } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { useMeta } from "@/components/Shell";

type Dash = {
  today: string;
  school: { name: string; district: string } | null;
  stats: {
    plans: number;
    lessons: number;
    units: number;
    teachers: number;
    upcoming: number;
    pending: number;
    published: number;
  };
  recent: { id: string; date: string; term: number; teacherName: string; rows: number; classes: string[]; teacherId: string }[];
  perClass: Record<string, number>;
  perArea: Record<string, number>;
  perTerm: Record<string, number>;
  activity: { date: string; count: number }[];
};

/** Animated count-up that stops at the target once (tabular numerals). */
function CountUp({ value }: { value: number }) {
  const [n, setN] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(value);
      return;
    }
    const start = performance.now();
    const dur = 700;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / dur);
      // ease-out cubic
      setN(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);
  return <>{n.toLocaleString()}</>;
}

export default function DashboardPage() {
  const { t, lang } = useI18n();
  const { meta } = useMeta();
  const toast = useToast();
  const [d, setD] = useState<Dash | null>(null);
  const [noticeSent, setNoticeSent] = useState(false);
  const locale = lang === "rw" ? "rw-RW" : lang === "fr" ? "fr-FR" : "en-GB";
  const isAdmin = meta.me.role === "admin";
  const pendingPlans = meta.pendingPlans ?? 0;

  useEffect(() => {
    const yearId = meta.activeYear?.id ?? "";
    api<Dash>(`/api/dashboard?year=${encodeURIComponent(yearId)}`).then(setD).catch(() => {});
  }, [meta.activeYear?.id]);

  // Admin notification: teachers submitted lesson plans for approval.
  useEffect(() => {
    if (!isAdmin || noticeSent) return;
    if (pendingPlans > 0) {
      setNoticeSent(true);
      toast(t("{n} lesson plan(s) awaiting approval", { n: pendingPlans }));
    }
  }, [isAdmin, noticeSent, pendingPlans, toast, t]);

  if (!d) return <Spinner />;

  function Bars({ obj }: { obj: Record<string, number> }) {
    const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (!entries.length) return <p className="muted">{t("No data yet.")}</p>;
    const max = Math.max(...entries.map((e) => e[1]));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {entries.map(([k, v]) => (
          <div className="bar-row" key={k}>
            <div title={k}>{k.length > 24 ? k.slice(0, 22) + "…" : k}</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${Math.max(4, Math.round((v / max) * 100))}%` }} />
            </div>
            <div className="val">{v}</div>
          </div>
        ))}
      </div>
    );
  }

  const stats: { num: number; lbl: string; icon: IconName; tone?: string }[] = [
    { num: d.stats.plans, lbl: t("Daily Plans"), icon: "fileText" },
    { num: d.stats.lessons, lbl: t("Lessons Planned"), icon: "book" },
    { num: d.stats.units, lbl: t("Units Covered"), icon: "layers" },
    { num: d.stats.upcoming, lbl: t("Upcoming Days"), icon: "calendar" },
  ];
  if (isAdmin) {
    stats.push(
      { num: d.stats.published, lbl: t("Published"), icon: "checkCircle", tone: "ok" },
      { num: d.stats.pending, lbl: t("Pending Approval"), icon: "clock", tone: "warn" }
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>
            {t("Welcome")}, {meta.me.name.split(" ")[0]}
          </h1>
          <div className="sub">
            {d.school?.name} · {t("Academic year {y}", { y: meta.activeYear?.label ?? "—" })}
          </div>
        </div>
        <div className="actions">
          <Link className="btn btn-primary" href="/planner">
            <Icon name="plus" size={16} /> {t("New Daily Plan")}
          </Link>
          <Link className="btn" href="/library">
            <Icon name="book" size={16} /> {t("Lesson Library")}
          </Link>
        </div>
      </div>

      {isAdmin && pendingPlans > 0 ? (
        <Link href="/approvals" className="banner banner-warn">
          <span className="ico" aria-hidden="true">
            <Icon name="bell" size={16} />
          </span>
          <strong>{t("{n} lesson plan(s) awaiting approval", { n: pendingPlans })}</strong>
          <span>— {t("Review and approve so they appear in the Lesson Library.")}</span>
          <span style={{ fontWeight: 700, marginLeft: "auto" }}>{t("Approvals")} →</span>
        </Link>
      ) : null}

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        {stats.map((s, i) => (
          <div className={"stat" + (s.tone ? " anim-in-" + Math.min(i + 1, 4) : "")} key={s.lbl}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div>
                <div className="num"><CountUp value={s.num} /></div>
                <div className="lbl">{s.lbl}</div>
              </div>
              <span className={"ico" + (s.tone ? " " + s.tone : "")} aria-hidden="true">
                <Icon name={s.icon} size={17} />
              </span>
            </div>
          </div>
        ))}
      </div>

      {isAdmin ? (
        <div className="banner banner-info">
          <span className="ico" aria-hidden="true">
            <Icon name="school" size={16} />
          </span>
          <strong>{t("School overview:")}</strong>{" "}
          <span>{t("{n} teacher(s) have planned lessons this year.", { n: d.stats.teachers })}</span>{" "}
          <Link href="/admin/teachers">{t("Manage teachers")} →</Link>
        </div>
      ) : null}

      <div className="grid-2">
        <div className="card">
          <SectionTitle icon="chart">{t("Lessons by Learning Area")}</SectionTitle>
          <Bars obj={d.perArea} />
        </div>
        <div className="card">
          <SectionTitle icon="school">{t("Lessons by Class")}</SectionTitle>
          <Bars obj={d.perClass} />
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <SectionTitle icon="calendar">{t("Planning Activity (last 30 plan-days)")}</SectionTitle>
          {d.activity.length ? (
            <>
              <div style={{ display: "flex", flexWrap: "wrap" }}>
                {d.activity.map((a) => (
                  <span
                    key={a.date}
                    className="dot"
                    title={`${fmtDateShort(a.date, locale)}: ${a.count} ${t("daily plan(s)")}`}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 5,
                      display: "inline-grid",
                      placeItems: "center",
                      fontSize: ".58rem",
                      margin: 2,
                      fontWeight: 700,
                      background: a.count >= 3 ? "var(--color-royal-700)" : a.count === 2 ? "var(--color-royal-500)" : "var(--color-royal-50)",
                      color: a.count >= 2 ? "#fff" : "var(--color-ink-3)",
                      border: a.count ? "none" : "1px dashed var(--color-line)",
                    }}
                  >
                    {a.count || ""}
                  </span>
                ))}
              </div>
              <p className="muted" style={{ fontSize: ".8rem", marginTop: 10 }}>{t("Each square is a day with plans. Darker = more plans that day.")}</p>
            </>
          ) : (
            <p className="muted">{t("No planning activity yet.")}</p>
          )}
        </div>
        <div className="card">
          <SectionTitle icon="clipboardCheck">{t("By Term")}</SectionTitle>
          <Bars obj={d.perTerm} />
          <h3 style={{ margin: "18px 0 6px", fontSize: ".92rem" }}>{t("Recent Plans")}</h3>
          {d.recent.length ? (
            <div>
              {d.recent.slice(0, 5).map((p) => (
                <Link className="recent-row" key={p.id} href={`/plans/${p.id}`}>
                  <strong>{fmtDateShort(p.date, locale)}</strong>
                  <TermChip term={p.term} />
                  <span className="detail">{isAdmin ? p.teacherName.split(" ")[0] : p.classes.join(", ")}</span>
                  <span className="detail">{p.rows} {t("lesson(s)")}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="muted">{t("No plans yet — create your first daily plan!")}</p>
          )}
        </div>
      </div>
    </>
  );
}
