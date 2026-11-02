"use client";

/* Lesson detail: the structured record behind a plan row. */

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { api, fmtDate, fmtDateShort } from "@/lib/client";
import { useI18n } from "@/lib/i18n-client";
import { useMeta } from "@/components/Shell";
import { Spinner, TermChip, Chip, SectionTitle } from "@/components/ui";
import { Icon } from "@/components/icons";
import { LessonDiscussion } from "@/components/LessonDiscussion";

type Lesson = {
  id: string;
  planId: string;
  teacherId: string;
  teacherName: string;
  yearLabel: string;
  term: number;
  date: string;
  time: string;
  status: string;
  className: string;
  learningArea: string;
  unit: string;
  competence: string;
  procedure: string;
};
type Similar = { lesson: { id: string; className: string; date: string; unit: string; procedure: string }; score: number };

export default function LessonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, lang } = useI18n();
  const { meta } = useMeta();
  const locale = lang === "rw" ? "rw-RW" : lang === "fr" ? "fr-FR" : "en-GB";
  const [data, setData] = useState<{ lesson: Lesson; similar: Similar[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ lesson: Lesson; similar: Similar[] }>(`/api/lessons/${encodeURIComponent(id)}`)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [id]);

  if (error) return <div className="form-error">{error}</div>;
  if (!data) return <Spinner />;
  const l = data.lesson;
  const canEdit = meta.me.role === "admin" || l.teacherId === meta.me.id;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{l.unit || t("Lesson")}</h1>
          <div className="sub" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <Chip text={l.className} kind="class" />
            <Chip text={l.learningArea} kind="area" />
            <TermChip term={l.term} />
            <span>
              {fmtDate(l.date, locale)} · {l.yearLabel} ·{" "}
              {l.teacherId === meta.me.id ? t("your lesson") : t("by {name}", { name: l.teacherName || t("Unknown") })}
            </span>
            {l.teacherId === meta.me.id ? (
              l.status === "published"
                ? <Chip text={t("Approved")} kind="ok" />
                : <Chip text={t("Pending approval")} kind="warn" />
            ) : null}
          </div>
        </div>
        <div className="actions">
          {canEdit ? (
            <Link className="btn btn-primary" href={`/planner?edit=${l.planId}`} title={t("Edit")} aria-label={t("Edit")}><Icon name="pencil" size={15} /></Link>
          ) : null}
          <Link className="btn" href={`/planner?from=${l.planId}`} title={t("Reuse a past lesson")} aria-label={t("Reuse a past lesson")}><Icon name="refresh" size={15} /></Link>
          <Link className="btn" href={`/plans/${l.planId}`} title={t("View")} aria-label={t("View")}><Icon name="eye" size={15} /></Link>
          <Link className="btn" href="/library" title={t("Lesson Library")} aria-label={t("Lesson Library")}><Icon name="arrowLeft" size={15} /></Link>
        </div>
      </div>
      {!canEdit ? (
        <p className="muted no-print" style={{ fontSize: ".85rem", marginTop: -6 }}>
          {t("This is a colleague's plan — read-only for you. Use “Reuse in a new plan” to copy it into your own.")}
        </p>
      ) : null}

      <div className="card">
        <SectionTitle icon="fileText">{t("Lesson record")}</SectionTitle>
        <dl className="kv">
          <dt>{t("Date")}</dt><dd>{fmtDate(l.date, locale)}</dd>
          <dt>{t("Academic year")}</dt><dd>{l.yearLabel || "—"}</dd>
          <dt>{t("Term")}</dt><dd>{t("Term {n}", { n: l.term })}</dd>
          <dt>{t("Teacher")}</dt><dd>{l.teacherName || "—"}</dd>
          <dt>{t("Class")}</dt><dd>{l.className || "—"}</dd>
          <dt>{t("Learning area")}</dt><dd>{l.learningArea || "—"}</dd>
          <dt>{t("Time")}</dt><dd>{l.time || "—"}</dd>
          <dt>{t("Unit / Topic")}</dt><dd>{l.unit || "—"}</dd>
        </dl>
        <h3 style={{ margin: "18px 0 8px", fontSize: ".95rem" }}>{t("Learning competence")}</h3>
        <div className="proc-block">{l.competence}</div>
        <h3 style={{ margin: "18px 0 8px", fontSize: ".95rem" }}>{t("Lesson procedure")}</h3>
        <div className="proc-block">{l.procedure}</div>
      </div>

      <LessonDiscussion planId={l.planId} isAdmin={meta.me.role === "admin"} />

      {data.similar.length ? (
        <div className="card no-print" style={{ marginTop: 16 }}>
          <SectionTitle icon="search">{t("Similar lessons")} ({t("same class & area")})</SectionTitle>
          <div className="lib-grid">
            {data.similar.map((s) => (
              <div key={s.lesson.id} className="lib-card">
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <Chip text={s.lesson.className} kind="class" />
                  <Chip text={fmtDateShort(s.lesson.date, locale)} kind="gray" />
                  <Chip text={t("{p}% match", { p: Math.round(s.score * 100) })} kind="ok" />
                </div>
                <div className="unit-name">{s.lesson.unit || t("Lesson")}</div>
                <div className="proc">{s.lesson.procedure}</div>
                <div style={{ marginTop: "auto", paddingTop: 8 }}>
                  <Link className="btn btn-sm" href={`/lessons/${s.lesson.id}`}><Icon name="eye" size={14} /> {t("Open")}</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

