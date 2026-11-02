"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, fmtDate, fmtDateShort } from "@/lib/client";
import { useI18n } from "@/lib/i18n-client";
import { useMeta } from "@/components/Shell";
import { Spinner, EmptyState, TermChip, Chip, useToast } from "@/components/ui";
import { Icon } from "@/components/icons";

type PlanSummary = {
  id: string;
  teacherId: string;
  teacherName: string;
  yearLabel: string;
  term: number;
  date: string;
  rows: number;
  classes: string[];
  areas: string[];
  feedback?: string;
  preview: { id: string; position: number; time: string; className: string; learningArea: string; subUnit: string; competence: string; procedure: string }[];
  updatedAt: string;
};

function ApprovalsInner() {
  const { t, lang } = useI18n();
  const { meta } = useMeta();
  const router = useRouter();
  const toast = useToast();
  const locale = lang === "rw" ? "rw-RW" : lang === "fr" ? "fr-FR" : "en-GB";
  const isAdmin = meta.me.role === "admin";

  const [pending, setPending] = useState<PlanSummary[] | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string>("");
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [feedbackPlanId, setFeedbackPlanId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ plans: PlanSummary[] }>("/api/plans?status=pending");
      setPending(res.plans);
    } catch {
      setPending([]);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  async function approve(id: string, action: "approve" | "revision" = "approve") {
    if (action === "revision" && !feedback.trim()) { toast(t("Add feedback explaining what needs revision."), "err"); return; }
    setApproving(id);
    try {
      await api(`/api/plans/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        body: { feedback: feedback, action },
      });
      setFeedback("");
      toast(action === "revision" ? t("Plan returned to the teacher for revision.") : t("Plan approved — now in the Lesson Library."), "ok");
      setPending((list) => (list ? list.filter((p) => p.id !== id) : list));
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    }
    setApproving(null);
    setFeedbackPlanId(null);
  }

  if (!isAdmin) {
    return (
      <EmptyState
        icon="shield"
        title={t("Administrator access required.")}
        sub={t("Ask your school administrator to approve lesson plans.")}
      />
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t("Approvals")}</h1>
          <div className="sub">
            {t("Lesson plans submitted by teachers — approve them to publish in the Lesson Library.")}
          </div>
        </div>
      </div>

      {pending === null ? (
        <Spinner />
      ) : pending.length === 0 ? (
        <EmptyState icon="checkCircle" title={t("All caught up!")} sub={t("No lesson plans are waiting for your approval right now.")} />
      ) : (
        <>
          <p className="muted" style={{ fontSize: ".85rem", margin: "0 0 10px" }}>
            {t("{n} lesson plan(s) awaiting approval", { n: pending.length })}
          </p>
          {pending.map((p) => (
            <div key={p.id} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontWeight: 800, fontSize: "1.02rem" }}>{fmtDate(p.date, locale)}</span>
                  <TermChip term={p.term} />
                  <Chip text={p.teacherName} kind="gray" />
                  <Chip text={p.yearLabel} kind="gray" />
                </div>
                <span className="muted" style={{ fontSize: ".8rem" }}>
                  {t("Submitted")} {fmtDateShort(String(p.updatedAt).slice(0, 10), locale)}
                </span>
              </div>
              <div className="meta-strip" style={{ borderLeftColor: "var(--color-warning)" }}>
                {p.classes.length ? (
                  <div className="line">
                    <span className="k">{t("Classes")}</span>
                    <span className="v">{p.classes.map((c) => <Chip key={c} text={c} kind="class" />)}</span>
                  </div>
                ) : null}
                {p.areas.length ? (
                  <div className="line">
                    <span className="k">{t("Areas")}</span>
                    <span className="v">{p.areas.map((a) => <Chip key={a} text={a} kind="area" />)}</span>
                  </div>
                ) : null}
                <div className="line">
                  <span className="k">{t("Lessons")}</span>
                  <span className="v">{t("{n} lesson(s) planned", { n: p.rows })}</span>
                </div>
              </div>
              <div className="row-actions no-print">
                <button className="btn btn-sm" aria-expanded={expandedPlanId === p.id} onClick={() => setExpandedPlanId((v) => v === p.id ? null : p.id)}>
                  <Icon name="eye" size={14} /> <span>{expandedPlanId === p.id ? t("Hide lesson content") : t("View lesson content")}</span>
                </button>
                <button className="btn btn-sm" onClick={() => setFeedbackPlanId((v) => v === p.id ? null : p.id)}>{t("Return for revision")}</button>
                <button className="btn btn-sm btn-accent" disabled={approving === p.id} onClick={() => approve(p.id)}>
                  <Icon name="checkCircle" size={14} /> <span>{t("Approve")}</span>
                </button>
              </div>
              {expandedPlanId === p.id ? (
                <section className="approval-plan-content" aria-label={t("Submitted lesson plan content")}>
                  <h2>{t("Submitted lesson content")}</h2>
                  {p.preview.map((row) => (
                    <article key={row.id} className="approval-lesson">
                      <div className="approval-lesson__meta"><strong>{t("Lesson {n}", { n: row.position })}</strong>{row.time ? <span>{row.time}</span> : null}<Chip text={row.className || t("Class not specified")} kind="class" /><Chip text={row.learningArea || t("Learning area not specified")} kind="area" /></div>
                      <h3>{row.competence.split(/[\n;•]+/).map((part) => part.trim()).find(Boolean) || t("Unit not specified")}</h3>
                      {row.subUnit ? <div className="lesson-subunit">{row.subUnit}</div> : null}
                      <div className="approval-lesson__section"><strong>{t("Learning competence")}</strong><p>{row.competence || "—"}</p></div>
                      <div className="approval-lesson__section"><strong>{t("Lesson procedure")}</strong><p>{row.procedure || "—"}</p></div>
                    </article>
                  ))}
                </section>
              ) : null}
              {feedbackPlanId === p.id ? (
                <div className="card" style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <strong>{t("Feedback and revision")}</strong>
                    <button className="btn btn-sm btn-ghost" onClick={() => setFeedbackPlanId(null)}>
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                  {p.feedback ? <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: ".9rem" }}>{p.feedback}</p> : null}
                  <label className="field-label">{t("Feedback / revision instructions")}</label>
                  <textarea className="input" rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder={t("Specific feedback (optional when approving)")} />
                  <div className="row-actions"><button className="btn btn-sm" disabled={approving === p.id} onClick={() => approve(p.id, "revision")}>{t("Return for revision")}</button><button className="btn btn-sm btn-accent" disabled={approving === p.id} onClick={() => approve(p.id)}>{t("Approve with feedback")}</button></div>
                </div>
              ) : null}
            </div>
          ))}
        </>
      )}
    </>
  );
}

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ApprovalsInner />
    </Suspense>
  );
}
