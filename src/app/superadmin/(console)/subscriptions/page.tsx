"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { Modal, Spinner, useConfirm, useToast } from "@/components/ui";
import {
  saApi,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtNumber,
  initials,
} from "@/lib/superadmin-client";
import {
  SaPageHeader,
  StatCard,
  StatusChip,
  SearchBox,
  Pagination,
  SectionCard,
} from "@/components/superadmin/ui";
import { Donut } from "@/components/superadmin/charts";

type SchoolBrief = { id: string; name: string; code: string; status: string; district?: string };

type Plan = {
  id: string;
  code: string;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  currency: string;
  maxTeachers: number | null;
  maxUsers: number | null;
  maxClasses: number | null;
  maxStorageMb: number | null;
  features: string[];
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  subscriptions: number;
  createdAt: string;
  updatedAt: string;
};

type SubscriptionRow = {
  id: string;
  status: string;
  billingCycle: string;
  startDate: string;
  renewsAt: string;
  endsAt: string;
  cancelledAt: string | null;
  notes: string;
  createdAt: string;
  school: SchoolBrief;
  plan: Plan;
  payments: number;
};

type SubsResponse = {
  subscriptions: SubscriptionRow[];
  plans: Plan[];
  schools: SchoolBrief[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  counts: Record<string, number>;
  planDistribution: { planId: string; count: number; name: string }[];
  revenue: { totalPaid: number };
};

type PaymentRow = {
  id: string;
  schoolId: string;
  subscriptionId: string | null;
  amount: number;
  currency: string;
  status: string;
  method: string;
  reference: string;
  paidAt: string | null;
  notes: string;
  createdAt: string;
  school: SchoolBrief;
  subscription: { id: string; status: string; billingCycle: string; plan: { name: string } } | null;
};

type PaymentsResponse = {
  payments: PaymentRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  summary: { totalPaid: number; paidRecords: number; paidLast30Days: number };
};

type Tab = "subscriptions" | "plans" | "payments";

const SUB_STATUSES = ["trial", "active", "expired", "cancelled", "suspended"];
const PAY_STATUSES = ["recorded", "paid", "failed", "refunded"];
const CYCLES = ["monthly", "annual"];
const PAY_METHODS = [
  { value: "", label: "Not specified" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthLabel(cycle: string): string {
  return cycle === "annual" ? "Annual" : "Monthly";
}

const EMPTY_PLAN = {
  code: "",
  name: "",
  description: "",
  monthlyPrice: "0",
  annualPrice: "0",
  currency: "RWF",
  maxTeachers: "",
  maxUsers: "",
  maxClasses: "",
  maxStorageMb: "",
  features: "",
  isActive: true,
  isDefault: false,
  sortOrder: "99",
};

type PlanForm = typeof EMPTY_PLAN;

const EMPTY_SUB = {
  schoolId: "",
  planId: "",
  status: "active",
  billingCycle: "monthly",
  startDate: today(),
  renewsAt: "",
  endsAt: "",
  notes: "",
};

type SubForm = typeof EMPTY_SUB;

const EMPTY_PAY = {
  schoolId: "",
  subscriptionId: "",
  amount: "",
  currency: "RWF",
  status: "paid",
  method: "",
  reference: "",
  paidAt: today(),
  notes: "",
};

type PayForm = typeof EMPTY_PAY;

export default function SubscriptionsPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [tab, setTab] = useState<Tab>("subscriptions");

  const [subsData, setSubsData] = useState<SubsResponse | null>(null);
  const [subsLoading, setSubsLoading] = useState(true);
  const [subsError, setSubsError] = useState("");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [planId, setPlanId] = useState("");
  const [cycle, setCycle] = useState("");
  const [page, setPage] = useState(1);

  const [payData, setPayData] = useState<PaymentsResponse | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState("");
  const [payQ, setPayQ] = useState("");
  const [payStatus, setPayStatus] = useState("");
  const [payPage, setPayPage] = useState(1);

  const [planOpen, setPlanOpen] = useState(false);
  const [planEditing, setPlanEditing] = useState<Plan | null>(null);
  const [planForm, setPlanForm] = useState<PlanForm>(EMPTY_PLAN);
  const [planBusy, setPlanBusy] = useState(false);

  const [subOpen, setSubOpen] = useState(false);
  const [subEditing, setSubEditing] = useState<SubscriptionRow | null>(null);
  const [subForm, setSubForm] = useState<SubForm>(EMPTY_SUB);
  const [subBusy, setSubBusy] = useState(false);

  const [payOpen, setPayOpen] = useState(false);
  const [payEditing, setPayEditing] = useState<PaymentRow | null>(null);
  const [payForm, setPayForm] = useState<PayForm>(EMPTY_PAY);
  const [payBusy, setPayBusy] = useState(false);
  const [paySubOptions, setPaySubOptions] = useState<SubscriptionRow[]>([]);
  const [paySubLoading, setPaySubLoading] = useState(false);

  const loadSubs = useCallback(async () => {
    setSubsLoading(true);
    setSubsError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      if (planId) params.set("planId", planId);
      if (cycle) params.set("cycle", cycle);
      const res = await saApi<SubsResponse>(`/api/superadmin/subscriptions?${params.toString()}`);
      setSubsData(res);
    } catch (err) {
      setSubsError(err instanceof Error ? err.message : "Could not load subscriptions.");
    } finally {
      setSubsLoading(false);
    }
  }, [page, q, status, planId, cycle]);

  useEffect(() => {
    loadSubs();
  }, [loadSubs]);

  const loadPayments = useCallback(async () => {
    setPayLoading(true);
    setPayError("");
    try {
      const params = new URLSearchParams({ page: String(payPage), pageSize: "25" });
      if (payQ.trim()) params.set("q", payQ.trim());
      if (payStatus) params.set("status", payStatus);
      const res = await saApi<PaymentsResponse>(`/api/superadmin/payments?${params.toString()}`);
      setPayData(res);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Could not load payments.");
    } finally {
      setPayLoading(false);
    }
  }, [payPage, payQ, payStatus]);

  useEffect(() => {
    if (tab === "payments" || !payData) loadPayments();
  }, [tab, payData, loadPayments]);

  const counts = useMemo(() => {
    const c = subsData?.counts ?? {};
    const sum = SUB_STATUSES.reduce((acc, s) => acc + (c[s] ?? 0), 0);
    return { total: sum, ...c } as Record<string, number>;
  }, [subsData]);

  const plans = subsData?.plans ?? [];
  const schools = subsData?.schools ?? [];
  const activeSubs = (counts.active ?? 0) + (counts.trial ?? 0);
  const currency = plans[0]?.currency ?? "RWF";

  const donut = [
    { label: "Active", count: counts.active ?? 0, color: "#16A34A" },
    { label: "Trial", count: counts.trial ?? 0, color: "#C9A227" },
    { label: "Expired", count: counts.expired ?? 0, color: "#97A0B8" },
    { label: "Suspended", count: counts.suspended ?? 0, color: "#D97706" },
    { label: "Cancelled", count: counts.cancelled ?? 0, color: "#DC2626" },
  ];

  function resetSubPage(fn: () => void) {
    fn();
    setPage(1);
  }
  function resetPayPage(fn: () => void) {
    fn();
    setPayPage(1);
  }

  /* ---------------- plan create / edit ---------------- */

  function openNewPlan() {
    setPlanEditing(null);
    setPlanForm(EMPTY_PLAN);
    setPlanOpen(true);
  }

  function openEditPlan(plan: Plan) {
    setPlanEditing(plan);
    setPlanForm({
      code: plan.code,
      name: plan.name,
      description: plan.description,
      monthlyPrice: String(plan.monthlyPrice),
      annualPrice: String(plan.annualPrice),
      currency: plan.currency,
      maxTeachers: plan.maxTeachers === null ? "" : String(plan.maxTeachers),
      maxUsers: plan.maxUsers === null ? "" : String(plan.maxUsers),
      maxClasses: plan.maxClasses === null ? "" : String(plan.maxClasses),
      maxStorageMb: plan.maxStorageMb === null ? "" : String(plan.maxStorageMb),
      features: plan.features.join("\n"),
      isActive: plan.isActive,
      isDefault: plan.isDefault,
      sortOrder: String(plan.sortOrder),
    });
    setPlanOpen(true);
  }

  async function savePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!planForm.name.trim()) {
      toast("A plan name is required.", "err");
      return;
    }
    if (!planEditing && !planForm.code.trim()) {
      toast("A plan code is required for a new plan.", "err");
      return;
    }
    const features = planForm.features
      .split(/[\n,]+/)
      .map((f) => f.trim())
      .filter(Boolean);
    const limit = (v: string) => (v.trim() === "" ? null : Number(v));
    const body: Record<string, unknown> = {
      name: planForm.name.trim(),
      description: planForm.description.trim(),
      monthlyPrice: Number(planForm.monthlyPrice) || 0,
      annualPrice: Number(planForm.annualPrice) || 0,
      currency: planForm.currency.trim().toUpperCase() || "RWF",
      maxTeachers: limit(planForm.maxTeachers),
      maxUsers: limit(planForm.maxUsers),
      maxClasses: limit(planForm.maxClasses),
      maxStorageMb: limit(planForm.maxStorageMb),
      features,
      isActive: planForm.isActive,
      isDefault: planForm.isDefault,
      sortOrder: Number(planForm.sortOrder) || 0,
    };
    if (!planEditing) body.code = planForm.code.trim();

    setPlanBusy(true);
    try {
      if (planEditing) {
        await saApi(`/api/superadmin/plans/${planEditing.id}`, { method: "PATCH", body });
        toast("Plan updated.", "ok");
      } else {
        await saApi("/api/superadmin/plans", { method: "POST", body });
        toast("Plan created.", "ok");
      }
      setPlanOpen(false);
      await loadSubs();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save this plan.", "err");
    } finally {
      setPlanBusy(false);
    }
  }

  async function togglePlanActive(plan: Plan) {
    const ok = await confirm(
      plan.isActive
        ? `Deactivate the ${plan.name} plan? It will no longer be offered to schools, but existing subscriptions keep working.`
        : `Activate the ${plan.name} plan so it can be assigned to schools?`,
      plan.isActive ? "Deactivate plan" : "Activate plan"
    );
    if (!ok) return;
    try {
      await saApi(`/api/superadmin/plans/${plan.id}`, {
        method: "PATCH",
        body: { isActive: !plan.isActive },
      });
      toast(`Plan ${plan.isActive ? "deactivated" : "activated"}.`, "ok");
      await loadSubs();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update this plan.", "err");
    }
  }

  /* ---------------- subscription create / edit ---------------- */

  function openNewSub() {
    setSubEditing(null);
    setSubForm({
      ...EMPTY_SUB,
      planId: plans.find((p) => p.isDefault)?.id ?? plans[0]?.id ?? "",
      startDate: today(),
    });
    setSubOpen(true);
  }

  function openEditSub(sub: SubscriptionRow) {
    setSubEditing(sub);
    setSubForm({
      schoolId: sub.school.id,
      planId: sub.plan.id,
      status: sub.status,
      billingCycle: sub.billingCycle,
      startDate: sub.startDate || today(),
      renewsAt: sub.renewsAt || "",
      endsAt: sub.endsAt || "",
      notes: sub.notes || "",
    });
    setSubOpen(true);
  }

  async function saveSub(e: React.FormEvent) {
    e.preventDefault();
    if (!subEditing && !subForm.schoolId) {
      toast("Choose a school.", "err");
      return;
    }
    if (!subForm.planId) {
      toast("Choose a subscription plan.", "err");
      return;
    }
    const body: Record<string, unknown> = {
      planId: subForm.planId,
      status: subForm.status,
      billingCycle: subForm.billingCycle,
      startDate: subForm.startDate || today(),
      renewsAt: subForm.renewsAt || null,
      endsAt: subForm.endsAt || null,
      notes: subForm.notes.trim(),
    };
    if (!subEditing) body.schoolId = subForm.schoolId;

    setSubBusy(true);
    try {
      if (subEditing) {
        await saApi(`/api/superadmin/subscriptions/${subEditing.id}`, { method: "PATCH", body });
        toast("Subscription updated.", "ok");
      } else {
        await saApi("/api/superadmin/subscriptions", { method: "POST", body });
        toast("Subscription assigned.", "ok");
      }
      setSubOpen(false);
      await Promise.all([loadSubs(), tab === "payments" ? loadPayments() : Promise.resolve()]);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save this subscription.", "err");
    } finally {
      setSubBusy(false);
    }
  }

  async function changeSubStatus(sub: SubscriptionRow, next: string) {
    const labels: Record<string, string> = {
      active: "activate",
      trial: "move back to trial",
      suspended: "suspend",
      expired: "mark expired",
      cancelled: "cancel",
    };
    const ok = await confirm(
      `Are you sure you want to ${labels[next] ?? next} the ${sub.plan.name} subscription for ${sub.school.name}?`,
      labels[next] ?? next
    );
    if (!ok) return;
    try {
      await saApi(`/api/superadmin/subscriptions/${sub.id}`, { method: "PATCH", body: { status: next } });
      toast(`Subscription ${next}.`, "ok");
      await loadSubs();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not change this subscription.", "err");
    }
  }

  /* ---------------- payments ---------------- */

  async function loadPaySubOptions(schoolId: string) {
    if (!schoolId) {
      setPaySubOptions([]);
      return;
    }
    setPaySubLoading(true);
    try {
      const res = await saApi<SubsResponse>(
        `/api/superadmin/subscriptions?schoolId=${encodeURIComponent(schoolId)}&pageSize=100`
      );
      setPaySubOptions(res.subscriptions);
    } catch {
      setPaySubOptions([]);
    } finally {
      setPaySubLoading(false);
    }
  }

  function openNewPayment() {
    setPayEditing(null);
    setPayForm({ ...EMPTY_PAY, currency, paidAt: today() });
    setPaySubOptions([]);
    setPayOpen(true);
  }

  function openEditPayment(payment: PaymentRow) {
    setPayEditing(payment);
    setPayForm({
      schoolId: payment.schoolId,
      subscriptionId: payment.subscriptionId || "",
      amount: String(payment.amount),
      currency: payment.currency,
      status: payment.status,
      method: payment.method,
      reference: payment.reference,
      paidAt: payment.paidAt ? payment.paidAt.slice(0, 10) : "",
      notes: payment.notes,
    });
    loadPaySubOptions(payment.schoolId);
    setPayOpen(true);
  }

  async function savePayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payForm.schoolId) {
      toast("Choose a school.", "err");
      return;
    }
    if (Number(payForm.amount) <= 0) {
      toast("Enter the amount that was actually received.", "err");
      return;
    }
    setPayBusy(true);
    try {
      if (payEditing) {
        await saApi(`/api/superadmin/payments/${payEditing.id}`, {
          method: "PATCH",
          body: {
            status: payForm.status,
            method: payForm.method,
            reference: payForm.reference.trim(),
            notes: payForm.notes.trim(),
            paidAt: payForm.paidAt || null,
          },
        });
        toast("Payment record updated.", "ok");
      } else {
        await saApi("/api/superadmin/payments", {
          method: "POST",
          body: {
            schoolId: payForm.schoolId,
            subscriptionId: payForm.subscriptionId || null,
            amount: Number(payForm.amount),
            currency: payForm.currency.trim().toUpperCase() || "RWF",
            status: payForm.status,
            method: payForm.method,
            reference: payForm.reference.trim(),
            paidAt: payForm.paidAt || null,
            notes: payForm.notes.trim(),
          },
        });
        toast("Payment recorded.", "ok");
      }
      setPayOpen(false);
      await Promise.all([loadPayments(), loadSubs()]);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save this payment.", "err");
    } finally {
      setPayBusy(false);
    }
  }

  async function markPaid(payment: PaymentRow) {
    const ok = await confirm(
      `Mark the ${fmtMoney(payment.amount, payment.currency)} payment from ${payment.school.name} as paid? Revenue totals are based only on paid records.`,
      "Mark as paid"
    );
    if (!ok) return;
    try {
      await saApi(`/api/superadmin/payments/${payment.id}`, {
        method: "PATCH",
        body: { status: "paid", paidAt: new Date().toISOString() },
      });
      toast("Payment marked as paid.", "ok");
      await Promise.all([loadPayments(), loadSubs()]);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update this payment.", "err");
    }
  }

  const subSchool = subsData?.schools.find((s) => s.id === subForm.schoolId);
  const paySchool = schools.find((s) => s.id === payForm.schoolId);

  return (
    <div className="stack">
      <SaPageHeader
        title="Subscriptions & Billing"
        sub="Plans, school subscriptions and manually recorded payments. Revenue is calculated only from records explicitly marked as paid — no transaction is ever simulated."
        actions={
          <>
            <button className="btn btn-sm" onClick={() => (tab === "payments" ? loadPayments() : loadSubs())}>
              <Icon name="refresh" size={14} /> Refresh
            </button>
            {tab === "plans" ? (
              <button className="btn btn-sm btn-primary" onClick={openNewPlan}>
                <Icon name="plus" size={14} /> New plan
              </button>
            ) : tab === "payments" ? (
              <button className="btn btn-sm btn-primary" onClick={openNewPayment}>
                <Icon name="plus" size={14} /> Record payment
              </button>
            ) : (
              <button className="btn btn-sm btn-primary" onClick={openNewSub}>
                <Icon name="plus" size={14} /> Assign subscription
              </button>
            )}
          </>
        }
      />

      <div className="stat-grid">
        <StatCard
          icon="creditCard"
          label="Active subscriptions"
          value={activeSubs}
          tone="ok"
          sub={`${counts.trial ?? 0} trials · ${counts.expired ?? 0} expired`}
        />
        <StatCard icon="layers" label="Plans offered" value={plans.length} sub={`${plans.filter((p) => p.isActive).length} active plans`} />
        <StatCard
          icon="chart"
          label="Recorded revenue"
          value={fmtMoney(subsData?.revenue.totalPaid ?? 0, currency)}
          accent
          sub="All-time paid records"
        />
        <StatCard
          icon="activity"
          label="Paid · last 30 days"
          value={fmtMoney(payData?.summary.paidLast30Days ?? 0, currency)}
          sub={`${fmtNumber(payData?.summary.paidRecords ?? 0)} paid record(s) in total`}
        />
      </div>

      <div className="sa-toolbar">
        <div className="sa-seg" role="group" aria-label="Billing section">
          <button type="button" className={tab === "subscriptions" ? "active" : ""} onClick={() => setTab("subscriptions")}>
            <Icon name="creditCard" size={14} /> Subscriptions <span className="count">{fmtNumber(counts.total ?? 0)}</span>
          </button>
          <button type="button" className={tab === "plans" ? "active" : ""} onClick={() => setTab("plans")}>
            <Icon name="layers" size={14} /> Plans <span className="count">{plans.length}</span>
          </button>
          <button type="button" className={tab === "payments" ? "active" : ""} onClick={() => setTab("payments")}>
            <Icon name="creditCard" size={14} /> Payments <span className="count">{payData?.total ?? 0}</span>
          </button>
        </div>
      </div>

      {/* ================= subscriptions ================= */}
      {tab === "subscriptions" ? (
        <>
          <div className="filters">
            <div className="grow">
              <label className="field-label">Search</label>
              <SearchBox
                value={q}
                onChange={(v) => resetSubPage(() => setQ(v))}
                placeholder="School name, code, district…"
              />
            </div>
            <div>
              <label className="field-label">Status</label>
              <select className="input" value={status} onChange={(e) => resetSubPage(() => setStatus(e.target.value))}>
                <option value="">All statuses</option>
                {SUB_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Plan</label>
              <select className="input" value={planId} onChange={(e) => resetSubPage(() => setPlanId(e.target.value))}>
                <option value="">All plans</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Billing</label>
              <select className="input" value={cycle} onChange={(e) => resetSubPage(() => setCycle(e.target.value))}>
                <option value="">All cycles</option>
                {CYCLES.map((c) => (
                  <option key={c} value={c}>
                    {monthLabel(c)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {subsError ? <div className="form-error">{subsError}</div> : null}

          <section className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>School</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Billing</th>
                    <th>Dates</th>
                    <th>Payments</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {subsLoading && !subsData ? (
                    <tr>
                      <td colSpan={7}>
                        <Spinner />
                      </td>
                    </tr>
                  ) : !subsData || subsData.subscriptions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="sa-empty-row">
                        No subscriptions match these filters.
                      </td>
                    </tr>
                  ) : (
                    subsData.subscriptions.map((sub) => (
                      <tr key={sub.id}>
                        <td>
                          <div className="sa-school-cell">
                            <span className="sa-avatar">{initials(sub.school.name)}</span>
                            <span className="sa-cell-main">
                              <strong>{sub.school.name}</strong>
                              <span>
                                {sub.school.code || "No code"}
                                {sub.school.district ? ` · ${sub.school.district}` : ""}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="sa-cell-main">
                            <strong>{sub.plan.name}</strong>
                            <span>
                              {fmtMoney(
                                sub.billingCycle === "annual" ? sub.plan.annualPrice : sub.plan.monthlyPrice,
                                sub.plan.currency
                              )}
                              {sub.billingCycle === "annual" ? " / year" : " / month"}
                            </span>
                          </div>
                        </td>
                        <td>
                          <StatusChip status={sub.status} />
                        </td>
                        <td>
                          <span className="sa-tag">{monthLabel(sub.billingCycle)}</span>
                        </td>
                        <td>
                          <div className="sa-row-title">{fmtDate(sub.startDate)}</div>
                          <div className="sa-row-sub">
                            {sub.renewsAt ? `Renews ${fmtDate(sub.renewsAt)}` : sub.endsAt ? `Ends ${fmtDate(sub.endsAt)}` : "No end date"}
                          </div>
                        </td>
                        <td>
                          <span className="sa-row-title">{fmtNumber(sub.payments)}</span>
                          <div className="sa-row-sub">recorded</div>
                        </td>
                        <td>
                          <div className="sa-table-actions">
                            {sub.status !== "active" ? (
                              <button className="btn btn-sm" onClick={() => changeSubStatus(sub, "active")}>
                                <Icon name="play" size={13} /> Activate
                              </button>
                            ) : (
                              <button className="btn btn-sm" onClick={() => changeSubStatus(sub, "suspended")}>
                                <Icon name="pause" size={13} /> Suspend
                              </button>
                            )}
                            <button className="btn btn-sm" onClick={() => openEditSub(sub)}>
                              <Icon name="pencil" size={13} /> Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {subsData ? (
              <div style={{ padding: "0 16px 14px" }}>
                <Pagination page={subsData.page} pages={subsData.pages} total={subsData.total} onPage={setPage} />
              </div>
            ) : null}
          </section>

          <div className="grid-2">
            <SectionCard title="Subscription status" icon="creditCard">
              <Donut data={donut} centerLabel="subscriptions" />
            </SectionCard>
            <SectionCard title="Plan distribution" icon="layers">
              {!subsData || subsData.planDistribution.length === 0 ? (
                <p className="muted">No subscriptions have been assigned yet.</p>
              ) : (
                <div className="sa-bars">
                  {subsData.planDistribution.map((p) => {
                    const total = subsData.planDistribution.reduce((s, x) => s + x.count, 0);
                    return (
                      <div key={p.planId} className="sa-bar-row">
                        <div className="sa-bar-label">
                          <strong>{p.name}</strong>
                          <span>
                            {p.count} {p.count === 1 ? "school" : "schools"}
                          </span>
                        </div>
                        <div className="bar-track">
                          <div
                            className="bar-fill"
                            style={{ width: `${total ? Math.max(3, (p.count / total) * 100) : 0}%` }}
                          />
                        </div>
                        <span className="sa-bar-pct">{total ? Math.round((p.count / total) * 100) : 0}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </div>
        </>
      ) : null}

      {/* ================= plans ================= */}
      {tab === "plans" ? (
        <SectionCard
          title="Subscription plans"
          icon="layers"
          action={
            <span className="sa-updated">Prices are shown in each plan&apos;s currency.</span>
          }
        >
          {subsLoading && !subsData ? (
            <Spinner />
          ) : (
            <div className="sa-plan-grid">
              {plans.map((plan) => (
                <div key={plan.id} className={"sa-plan-card" + (plan.isDefault ? " default" : "")}>
                  <div className="sa-card-head" style={{ marginBottom: 2 }}>
                    <div>
                      <h4>{plan.name}</h4>
                      <span className="sa-tag">{plan.code}</span>
                    </div>
                    <div className="sa-chip-row">
                      {plan.isDefault ? <span className="sa-tag gold">Default</span> : null}
                      <StatusChip status={plan.isActive ? "active" : "disabled"} label={plan.isActive ? "Active" : "Inactive"} />
                    </div>
                  </div>
                  <div className="sa-plan-price">
                    {fmtMoney(plan.monthlyPrice, plan.currency)}
                    <small> / month</small>
                  </div>
                  <div className="sa-row-sub">{fmtMoney(plan.annualPrice, plan.currency)} per year</div>
                  {plan.description ? <p className="sa-plan-desc">{plan.description}</p> : null}
                  <div className="sa-plan-limits">
                    <span className="sa-tag">Teachers {plan.maxTeachers ?? "∞"}</span>
                    <span className="sa-tag">Users {plan.maxUsers ?? "∞"}</span>
                    <span className="sa-tag">Classes {plan.maxClasses ?? "∞"}</span>
                    <span className="sa-tag">Storage {plan.maxStorageMb ? `${plan.maxStorageMb} MB` : "∞"}</span>
                  </div>
                  {plan.features.length ? (
                    <ul className="sa-feature-list">
                      {plan.features.map((f) => (
                        <li key={f}>
                          <Icon name="check" size={13} /> {f}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="sa-inline sa-inline-end" style={{ marginTop: 6 }}>
                    <span className="sa-row-sub">
                      {plan.subscriptions} {plan.subscriptions === 1 ? "subscription" : "subscriptions"}
                    </span>
                    <button className="btn btn-sm" onClick={() => togglePlanActive(plan)}>
                      <Icon name={plan.isActive ? "pause" : "play"} size={13} />
                      {plan.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button className="btn btn-sm btn-primary" onClick={() => openEditPlan(plan)}>
                      <Icon name="pencil" size={13} /> Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      ) : null}

      {/* ================= payments ================= */}
      {tab === "payments" ? (
        <>
          <div className="filters">
            <div className="grow">
              <label className="field-label">Search</label>
              <SearchBox
                value={payQ}
                onChange={(v) => resetPayPage(() => setPayQ(v))}
                placeholder="School, reference, notes…"
              />
            </div>
            <div>
              <label className="field-label">Status</label>
              <select
                className="input"
                value={payStatus}
                onChange={(e) => resetPayPage(() => setPayStatus(e.target.value))}
              >
                <option value="">All statuses</option>
                {PAY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {payError ? <div className="form-error">{payError}</div> : null}

          <div className="sa-mini-grid">
            <div className="card sa-mini">
              <Icon name="creditCard" size={16} />
              <div>
                <strong>{fmtMoney(payData?.summary.totalPaid ?? 0, currency)}</strong>
                <span>total recorded as paid</span>
              </div>
            </div>
            <div className="card sa-mini">
              <Icon name="chart" size={16} />
              <div>
                <strong>{fmtMoney(payData?.summary.paidLast30Days ?? 0, currency)}</strong>
                <span>paid in the last 30 days</span>
              </div>
            </div>
            <div className="card sa-mini">
              <Icon name="checkCircle" size={16} />
              <div>
                <strong>{fmtNumber(payData?.summary.paidRecords ?? 0)}</strong>
                <span>paid records</span>
              </div>
            </div>
          </div>

          <section className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>School</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {payLoading && !payData ? (
                    <tr>
                      <td colSpan={7}>
                        <Spinner />
                      </td>
                    </tr>
                  ) : !payData || payData.payments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="sa-empty-row">
                        No payments have been recorded.
                      </td>
                    </tr>
                  ) : (
                    payData.payments.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <span className="sa-row-title">{fmtDate(p.paidAt || p.createdAt)}</span>
                          <div className="sa-row-sub">{p.paidAt ? "Paid date" : "Recorded"}</div>
                        </td>
                        <td>
                          <div className="sa-school-cell">
                            <span className="sa-avatar">{initials(p.school.name)}</span>
                            <span className="sa-cell-main">
                              <strong>{p.school.name}</strong>
                              <span>{p.subscription ? p.subscription.plan.name : "No subscription linked"}</span>
                            </span>
                          </div>
                        </td>
                        <td className="sa-price">{fmtMoney(p.amount, p.currency)}</td>
                        <td>
                          <StatusChip status={p.status} />
                        </td>
                        <td>{p.method ? p.method.replace(/_/g, " ") : "—"}</td>
                        <td className="sa-mono">{p.reference || "—"}</td>
                        <td>
                          <div className="sa-table-actions">
                            {p.status !== "paid" ? (
                              <button className="btn btn-sm btn-primary" onClick={() => markPaid(p)}>
                                <Icon name="check" size={13} /> Mark paid
                              </button>
                            ) : null}
                            <button className="btn btn-sm" onClick={() => openEditPayment(p)}>
                              <Icon name="pencil" size={13} /> Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {payData ? (
              <div style={{ padding: "0 16px 14px" }}>
                <Pagination page={payData.page} pages={payData.pages} total={payData.total} onPage={setPayPage} />
              </div>
            ) : null}
          </section>

          <p className="sa-note">
            Payments here are records of money actually received outside the platform (bank transfer, mobile money,
            cash or card). Marking a record as paid changes revenue analytics; it does not charge anyone.
          </p>
        </>
      ) : null}

      {/* ---------------- plan modal ---------------- */}
      {planOpen ? (
        <Modal
          title={planEditing ? `Edit ${planEditing.name}` : "New subscription plan"}
          onClose={() => setPlanOpen(false)}
          maxWidth={720}
        >
          <form onSubmit={savePlan} className="stack" style={{ gap: 14 }}>
            <div className="sa-two">
              <div>
                <label className="field-label">Plan name</label>
                <input
                  className="input"
                  value={planForm.name}
                  onChange={(e) => setPlanForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="field-label">Plan code</label>
                <input
                  className="input"
                  value={planForm.code}
                  onChange={(e) => setPlanForm((f) => ({ ...f, code: e.target.value }))}
                  disabled={!!planEditing}
                  placeholder="e.g. starter"
                   
                />
                {planEditing ? <p className="field-hint">Plan codes cannot be changed once created.</p> : null}
              </div>
            </div>
            <div>
              <label className="field-label">Description</label>
              <textarea
                className="input"
                rows={2}
                value={planForm.description}
                onChange={(e) => setPlanForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="form-grid-3">
              <div>
                <label className="field-label">Monthly price</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={planForm.monthlyPrice}
                  onChange={(e) => setPlanForm((f) => ({ ...f, monthlyPrice: e.target.value }))}
                />
              </div>
              <div>
                <label className="field-label">Annual price</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={planForm.annualPrice}
                  onChange={(e) => setPlanForm((f) => ({ ...f, annualPrice: e.target.value }))}
                />
              </div>
              <div>
                <label className="field-label">Currency</label>
                <input
                  className="input"
                  value={planForm.currency}
                  onChange={(e) => setPlanForm((f) => ({ ...f, currency: e.target.value }))}
                />
              </div>
            </div>
            <div className="form-grid-3">
              {(
                [
                  ["maxTeachers", "Max teachers"],
                  ["maxUsers", "Max users"],
                  ["maxClasses", "Max classes"],
                  ["maxStorageMb", "Max storage (MB)"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="field-label">{label}</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={planForm[key]}
                    onChange={(e) => setPlanForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder="Unlimited"
                  />
                </div>
              ))}
              <div>
                <label className="field-label">Sort order</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={planForm.sortOrder}
                  onChange={(e) => setPlanForm((f) => ({ ...f, sortOrder: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="field-label">Features (one per line)</label>
              <textarea
                className="input"
                rows={5}
                value={planForm.features}
                onChange={(e) => setPlanForm((f) => ({ ...f, features: e.target.value }))}
                placeholder={"Lesson planner\nLesson library\nEmail support"}
              />
            </div>
            <div className="sa-inline" style={{ gap: 18 }}>
              <label className="sa-check">
                <input
                  type="checkbox"
                  checked={planForm.isActive}
                  onChange={(e) => setPlanForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                Offered to schools
              </label>
              <label className="sa-check">
                <input
                  type="checkbox"
                  checked={planForm.isDefault}
                  onChange={(e) => setPlanForm((f) => ({ ...f, isDefault: e.target.checked }))}
                />
                Default plan
              </label>
            </div>
            <div className="modal__actions">
              <button type="button" className="btn" onClick={() => setPlanOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={planBusy}>
                {planBusy ? <span className="sa-spin" /> : <Icon name="check" size={15} />}
                {planEditing ? "Save plan" : "Create plan"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {/* ---------------- subscription modal ---------------- */}
      {subOpen ? (
        <Modal
          title={subEditing ? `Subscription · ${subEditing.school.name}` : "Assign a subscription"}
          onClose={() => setSubOpen(false)}
          maxWidth={620}
        >
          <form onSubmit={saveSub} className="stack" style={{ gap: 14 }}>
            {!subEditing ? (
              <div>
                <label className="field-label">School</label>
                <select
                  className="input"
                  value={subForm.schoolId}
                  onChange={(e) => setSubForm((f) => ({ ...f, schoolId: e.target.value }))}
                  required
                >
                  <option value="">Choose a school…</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.code ? ` (${s.code})` : ""}
                    </option>
                  ))}
                </select>
                {subSchool && subSchool.status !== "active" ? (
                  <p className="field-hint">
                    Note: this school is currently {subSchool.status}.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="sa-detail-grid">
                <div className="sa-info">
                  <span>School</span>
                  <strong>{subEditing.school.name}</strong>
                </div>
                <div className="sa-info">
                  <span>Current plan</span>
                  <strong>{subEditing.plan.name}</strong>
                </div>
              </div>
            )}
            <div className="sa-two">
              <div>
                <label className="field-label">Plan</label>
                <select
                  className="input"
                  value={subForm.planId}
                  onChange={(e) => setSubForm((f) => ({ ...f, planId: e.target.value }))}
                  required
                >
                  <option value="">Choose a plan…</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {fmtMoney(p.monthlyPrice, p.currency)}/mo
                      {p.isActive ? "" : " (inactive)"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Billing cycle</label>
                <select
                  className="input"
                  value={subForm.billingCycle}
                  onChange={(e) => setSubForm((f) => ({ ...f, billingCycle: e.target.value }))}
                >
                  {CYCLES.map((c) => (
                    <option key={c} value={c}>
                      {monthLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="sa-two">
              <div>
                <label className="field-label">Status</label>
                <select
                  className="input"
                  value={subForm.status}
                  onChange={(e) => setSubForm((f) => ({ ...f, status: e.target.value }))}
                >
                  {SUB_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s[0].toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Start date</label>
                <input
                  className="input"
                  type="date"
                  value={subForm.startDate}
                  onChange={(e) => setSubForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="sa-two">
              <div>
                <label className="field-label">Renews at</label>
                <input
                  className="input"
                  type="date"
                  value={subForm.renewsAt}
                  onChange={(e) => setSubForm((f) => ({ ...f, renewsAt: e.target.value }))}
                />
              </div>
              <div>
                <label className="field-label">Ends at</label>
                <input
                  className="input"
                  type="date"
                  value={subForm.endsAt}
                  onChange={(e) => setSubForm((f) => ({ ...f, endsAt: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="field-label">Notes</label>
              <textarea
                className="input"
                rows={2}
                value={subForm.notes}
                onChange={(e) => setSubForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Purchase order, reference or internal note…"
              />
            </div>
            {["trial", "active"].includes(subForm.status) && (!subEditing || subEditing.status !== subForm.status) ? (
              <div className="sa-callout warn">
                <Icon name="warning" size={16} />
                <span>
                  Activating this subscription will cancel any other active or trial subscription for this school.
                  Only one live subscription is allowed per school.
                </span>
              </div>
            ) : null}
            <div className="modal__actions">
              <button type="button" className="btn" onClick={() => setSubOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={subBusy}>
                {subBusy ? <span className="sa-spin" /> : <Icon name="check" size={15} />}
                {subEditing ? "Save subscription" : "Assign subscription"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {/* ---------------- payment modal ---------------- */}
      {payOpen ? (
        <Modal
          title={payEditing ? "Edit payment record" : "Record a payment"}
          onClose={() => setPayOpen(false)}
          maxWidth={620}
        >
          <form onSubmit={savePayment} className="stack" style={{ gap: 14 }}>
            <div>
              <label className="field-label">School</label>
              <select
                className="input"
                value={payForm.schoolId}
                onChange={(e) => {
                  const schoolId = e.target.value;
                  setPayForm((f) => ({ ...f, schoolId, subscriptionId: "" }));
                  loadPaySubOptions(schoolId);
                }}
                disabled={!!payEditing}
                required
              >
                <option value="">Choose a school…</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.code ? ` (${s.code})` : ""}
                  </option>
                ))}
              </select>
              {payEditing ? <p className="field-hint">A payment record cannot be moved to another school.</p> : null}
            </div>
            <div>
              <label className="field-label">Linked subscription (optional)</label>
              <select
                className="input"
                value={payForm.subscriptionId}
                onChange={(e) => setPayForm((f) => ({ ...f, subscriptionId: e.target.value }))}
                disabled={!payForm.schoolId || paySubLoading}
              >
                <option value="">{paySubLoading ? "Loading…" : "Not linked to a subscription"}</option>
                {paySubOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.plan.name} · {monthLabel(s.billingCycle)} · {s.status} · {fmtDate(s.startDate)}
                  </option>
                ))}
              </select>
              {payForm.schoolId && !paySubLoading && paySubOptions.length === 0 ? (
                <p className="field-hint">This school has no subscriptions yet.</p>
              ) : null}
            </div>
            <div className="sa-two">
              <div>
                <label className="field-label">Amount received</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={payForm.amount}
                  onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="field-label">Currency</label>
                <input
                  className="input"
                  value={payForm.currency}
                  onChange={(e) => setPayForm((f) => ({ ...f, currency: e.target.value }))}
                />
              </div>
            </div>
            <div className="sa-two">
              <div>
                <label className="field-label">Status</label>
                <select
                  className="input"
                  value={payForm.status}
                  onChange={(e) => setPayForm((f) => ({ ...f, status: e.target.value }))}
                >
                  {PAY_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s[0].toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Payment date</label>
                <input
                  className="input"
                  type="date"
                  value={payForm.paidAt}
                  onChange={(e) => setPayForm((f) => ({ ...f, paidAt: e.target.value }))}
                />
              </div>
            </div>
            <div className="sa-two">
              <div>
                <label className="field-label">Method</label>
                <select
                  className="input"
                  value={payForm.method}
                  onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}
                >
                  {PAY_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Reference</label>
                <input
                  className="input"
                  value={payForm.reference}
                  onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))}
                  placeholder="Bank slip / MoMo transaction ID"
                />
              </div>
            </div>
            <div>
              <label className="field-label">Notes</label>
              <textarea
                className="input"
                rows={2}
                value={payForm.notes}
                onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
            {paySchool ? (
              <p className="field-hint">
                Recording a payment for {paySchool.name}. Amounts are stored exactly as entered; no gateway is
                contacted.
              </p>
            ) : null}
            <div className="modal__actions">
              <button type="button" className="btn" onClick={() => setPayOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={payBusy}>
                {payBusy ? <span className="sa-spin" /> : <Icon name="check" size={15} />}
                {payEditing ? "Save payment" : "Record payment"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
