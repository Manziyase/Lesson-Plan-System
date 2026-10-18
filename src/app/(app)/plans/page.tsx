"use client";

/* Plan history: browse/search all daily plans with filters (legacy parity). */

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, fmtDate, fmtDateShort } from "@/lib/client";
import { useI18n } from "@/lib/i18n-client";
import { useMeta } from "@/components/Shell";
import { Spinner, EmptyState, TermChip, Chip, useConfirm, useToast } from "@/components/ui";
import { Icon } from "@/components/icons";

type PlanSummary = {
  id: string;
  teacherId: string;
  teacherName: string;
  term: number;
  date: string;
  status: string;
  approvedByName: string;
  rows: number;
  classes: string[];
  areas: string[];
  updatedAt: string;
};

function PlansInner() {
  const { t, lang } = useI18n();
  const { meta } = useMeta();
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const locale = lang === "rw" ? "rw-RW" : lang === "fr" ? "fr-FR" : "en-GB";
  const isAdmin = meta.me.role === "admin";

  const [filters, setFilters] = useState({
    q: sp.get("q") || "",
    class: sp.get("class") || "",
    area: sp.get("area") || "",
    term: sp.get("term") || "",
    from: sp.get("from") || "",
    to: sp.get("to") || "",
    teacher: sp.get("teacher") || "",
    status: sp.get("status") || "",
    mine: sp.get("mine") ?? (isAdmin ? "" : "1"),
  });
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    qs.set("year", meta.activeYear?.id ?? "");
    Object.entries(filters).forEach(([k, v]) => {
      if (v) qs.set(k, v);
    });
    try {
      const res = await api<{ plans: PlanSummary[] }>("/api/plans?" + qs.toString());
      setPlans(res.plans);
    } catch {
      setPlans([]);
    }
  }, [filters, meta.activeYear?.id]);

  useEffect(() => {
    load();
  }, [load]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) qs.set(k, v);
    });
    router.replace("/plans" + (qs.toString() ? "?" + qs.toString() : ""));
  }

  async function approve(id: string) {
    const ok = await confirm(t("Approve this plan? It will appear school-wide in the Lesson Library."), t("Approve"));
    if (!ok) return;
    try {
      await api("/api/plans/" + id + "/approve", { method: "POST" });
      toast(t("Plan approved — now in the Lesson Library."), "ok");
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  async function del(id: string) {
    const ok = await confirm(t("Delete this daily plan and its lessons? This cannot be undone."));
    if (!ok) return;
    try {
      await api("/api/plans/" + id, { method: "DELETE" });
      toast(t("Plan deleted."), "ok");
      load();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t("My Plans")}</h1>
          <div className="sub">
            {filters.mine === "1"
              ? t("Your daily plans for {y}. Plans still awaiting admin approval stay out of the Lesson Library.", { y: meta.activeYear?.label ?? "" })
              : t("All daily plans across {school} — read-only except your own.", { school: meta.school?.name ?? t("the school") })}
          </div>
        </div>
        <Link className="btn btn-primary" href="/planner">
          <Icon name="plus" size={16} /> {t("New Daily Plan")}
        </Link>
      </div>

      <form className="filters no-print" onSubmit={submit}>
        <div className="grow">
          <label className="field-label">{t("Search")}</label>
          <input className="input" value={filters.q} placeholder={t("unit, competence, procedure, teacher…")} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
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
            {meta.learningAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
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
          <label className="field-label">{t("Approval")}</label>
          <select className="input" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">{t("All")}</option>
            <option value="pending">{t("Pending approval")}</option>
            <option value="published">{t("Approved")}</option>
          </select>
        </div>
        <div>
          <label className="field-label">{t("From")}</label>
          <input className="input" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        </div>
        <div>
          <label className="field-label">{t("To")}</label>
          <input className="input" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </div>
        <div>
          <label className="field-label">{t("Scope")}</label>
          <select className="input" value={filters.mine} onChange={(e) => setFilters({ ...filters, mine: e.target.value })}>
            <option value="">{t("Whole school")}</option>
            <option value="1">{t("Only my plans")}</option>
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
          <Link className="btn" href="/plans"><Icon name="reset" size={15} /> {t("Reset")}</Link>
        </div>
      </form>

      {plans === null ? (
        <Spinner />
      ) : plans.length === 0 ? (
        <EmptyState
          icon="fileText"
          title={t("No plans found")}
          sub={t("Try adjusting the filters, or create a new daily plan.")}
          action={<Link className="btn btn-primary" href="/planner"><Icon name="plus" size={15} /> {t("New Daily Plan")}</Link>}
        />
      ) : (
        <>
          <p className="muted" style={{ fontSize: ".85rem", margin: "0 0 10px" }}>{plans.length} {t("daily plan(s)")}</p>
          {plans.map((p) => {
            const mine = p.teacherId === meta.me.id;
            const canEdit = mine || isAdmin;
            return (
              <div key={p.id} className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontWeight: 800, fontSize: "1.02rem" }}>{fmtDate(p.date, locale)}</span>
                    <TermChip term={p.term} />
                    {mine ? <Chip text={t("You")} kind="ok" /> : <Chip text={p.teacherName} kind="gray" />}
                    {p.status === "published"
                      ? <Chip text={p.approvedByName ? `${t("Approved")} · ${p.approvedByName}` : t("Approved")} kind="ok" />
                      : <Chip text={t("Pending approval")} kind="warn" />}
                  </div>
                  <span className="muted" style={{ fontSize: ".8rem" }}>
                    {t("Updated")} {fmtDateShort(String(p.updatedAt).slice(0, 10), locale)}
                  </span>
                </div>
                <div className="meta-strip">
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
                  <Link className="btn btn-sm" href={`/plans/${p.id}`}><Icon name="eye" size={14} /> {t("View")}</Link>
                  {isAdmin && p.status === "pending" ? (
                    <button className="btn btn-sm btn-accent" onClick={() => approve(p.id)}><Icon name="checkCircle" size={14} /> {t("Approve")}</button>
                  ) : null}
                  {canEdit ? <Link className="btn btn-sm btn-primary" href={`/planner?edit=${p.id}`}><Icon name="pencil" size={14} /> {t("Edit")}</Link> : null}
                  <Link className="btn btn-sm" href={`/planner?from=${p.id}`}><Icon name="copy" size={14} /> {t("Duplicate")}</Link>
                  {canEdit ? <button className="btn btn-sm btn-danger" onClick={() => del(p.id)}><Icon name="trash" size={14} /> {t("Delete")}</button> : null}
                </div>
              </div>
            );
          })}
        </>
      )}
    </>
  );
}

export default function PlansPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <PlansInner />
    </Suspense>
  );
}
