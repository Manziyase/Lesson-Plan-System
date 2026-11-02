"use client";

/* Plan detail (read-only) — mirrors the four-column table, print-ready,
   and suggests similar past lessons for each row. */

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { api, fmtDate, fmtDateShort } from "@/lib/client";
import { useI18n } from "@/lib/i18n-client";
import { useMeta } from "@/components/Shell";
import { Spinner, TermChip, Chip, SectionTitle, setPrintHeader, useToast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { LessonDiscussion } from "@/components/LessonDiscussion";

type Row = { time: string; className: string; learningArea: string; competence: string; procedure: string };
type Plan = {
  id: string;
  teacherId: string;
  teacherName: string;
  yearLabel: string;
  term: number;
  date: string;
  status: string;
  approvedByName: string;
  rows: Row[];
};
type Similar = { lesson: { id: string; className: string; learningArea: string; date: string; unit: string; procedure: string; teacherName: string }; score: number };

export default function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, lang } = useI18n();
  const { meta } = useMeta();
  const locale = lang === "rw" ? "rw-RW" : lang === "fr" ? "fr-FR" : "en-GB";
  const [data, setData] = useState<{ plan: Plan; similar: Similar[] } | null>(null);
  const [error, setError] = useState("");
  const toast = useToast();

  useEffect(() => {
    api<{ plan: Plan; similar: Similar[] }>(`/api/plans/${encodeURIComponent(id)}`)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [id]);

  if (error) return <div className="form-error">{error}</div>;
  if (!data) return <Spinner />;
  const plan = data.plan;
  const canEdit = meta.me.role === "admin" || plan.teacherId === meta.me.id;
  const isAdmin = meta.me.role === "admin";
  const isMine = plan.teacherId === meta.me.id;

  async function approve() {
    try {
      await api(`/api/plans/${encodeURIComponent(plan.id)}/approve`, { method: "POST" });
      toast(t("Plan approved — now in the Lesson Library."), "ok");
      setData({ ...data!, plan: { ...plan, status: "published", approvedByName: meta.me.name } });
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t("Daily Plan")} — {fmtDate(plan.date, locale)}</h1>
          <div className="sub" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span>{plan.teacherName}</span>
            <TermChip term={plan.term} />
            <span>{plan.yearLabel}</span>
          </div>
        </div>
        <div className="actions">
          {isAdmin && plan.status !== "published" ? (
            <button className="btn btn-accent" onClick={approve}><Icon name="checkCircle" size={15} /> {t("Approve")}</button>
          ) : null}
          {canEdit ? (
            <Link className="btn btn-primary" href={`/planner?edit=${plan.id}`}><Icon name="pencil" size={15} /> {t("Edit")}</Link>
          ) : (
            <Link className="btn" href={`/planner?from=${plan.id}`}><Icon name="refresh" size={15} /> {t("Reuse a past lesson")}</Link>
          )}
          <Link className="btn" href={`/planner?from=${plan.id}`}><Icon name="copy" size={15} /> {t("Duplicate")}</Link>
          <Link className="btn" href="/plans"><Icon name="arrowLeft" size={15} /> {t("My Plans")}</Link>
          <button
            className="btn btn-primary"
            onClick={() => {
              setPrintHeader(meta.school?.name ?? "", [
                t("Daily Lesson Plan"),
                t("Teacher: {name}", { name: plan.teacherName }),
                t("Date: {date}", { date: fmtDate(plan.date, locale) }),
                t("Term {n}", { n: plan.term }),
                t("Academic Year: {y}", { y: plan.yearLabel }),
              ]);
              window.print();
            }}
          >
            <Icon name="printer" size={15} /> {t("Print")}
          </button>
        </div>
      </div>
      {isMine ? (
        plan.status === "published" ? (
          <div className="banner banner-ok">
            <span className="ico" aria-hidden="true"><Icon name="checkCircle" size={16} /></span>
            <strong>{t("Approved")}{plan.approvedByName ? ` — ${t("reviewed by {name}", { name: plan.approvedByName })}` : ""}.</strong>
            <span>{t("This plan is visible school-wide in the Lesson Library.")}</span>
          </div>
        ) : (
          <div className="banner banner-warn">
            <span className="ico" aria-hidden="true"><Icon name="clock" size={16} /></span>
            <strong>{t("Pending approval")}</strong>
            <span>{t("— visible to you only until an administrator approves it, then it appears in the Lesson Library.")}</span>
          </div>
        )
      ) : null}
      {!canEdit ? (
        <p className="muted no-print" style={{ fontSize: ".85rem", marginTop: -6 }}>
          {t("This is a colleague's daily plan — read-only for you. “Duplicate & adapt” copies it into your own archive.")}
        </p>
      ) : null}

      <div className="planner-table-wrap">
        <table className="planner">
          <thead>
            <tr>
              <th className="col-time">{t("Time")}</th>
              <th>{t("Class")}</th>
              <th className="col-area">{t("Learning Area")}</th>
              <th>{t("Learning Competence / Unit")}</th>
              <th>{t("Lesson Procedure")}</th>
            </tr>
          </thead>
          <tbody>
            {plan.rows.map((r, i) => (
              <tr key={i}>
                <td style={{ whiteSpace: "pre-line" }}>{r.time}</td>
                <td><Chip text={r.className || "—"} kind="class" /></td>
                <td><Chip text={r.learningArea || "—"} kind="area" /></td>
                <td style={{ whiteSpace: "pre-line" }}>{r.competence}</td>
                <td style={{ whiteSpace: "pre-line" }}>{r.procedure}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <LessonDiscussion planId={plan.id} isAdmin={isAdmin} />

      {data.similar.length ? (
        <div className="card no-print" style={{ marginTop: 16 }}>
          <SectionTitle icon="search">{t("Similar lessons from your archive")}</SectionTitle>
          <p className="muted" style={{ fontSize: ".85rem", marginTop: -4 }}>{t("Based on the classes and learning areas in this plan — review them to reuse what worked well.")}</p>
          <div className="lib-grid">
            {data.similar.map((s) => (
              <div key={s.lesson.id} className="lib-card">
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <Chip text={s.lesson.className} kind="class" />
                  <Chip text={s.lesson.learningArea} kind="area" />
                  <Chip text={fmtDateShort(s.lesson.date, locale)} kind="gray" />
                  <Chip text={t("{p}% match", { p: Math.round(s.score * 100) })} kind="ok" />
                </div>
                <div className="unit-name">{s.lesson.unit || t("Lesson")}</div>
                <div className="proc">{s.lesson.procedure}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
                  <span className="muted" style={{ fontSize: ".8rem" }}>{t("by {name}", { name: s.lesson.teacherName })}</span>
                  <Link className="btn btn-sm" href={`/lessons/${s.lesson.id}`}>{t("Open")}</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
