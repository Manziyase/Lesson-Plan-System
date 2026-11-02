"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Modal, Spinner, useConfirm, useToast } from "@/components/ui";
import {
  saApi,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtNumber,
  initials,
  timeAgo,
} from "@/lib/superadmin-client";
import {
  SaPageHeader,
  StatusChip,
  SearchBox,
  Pagination,
  InfoItem,
  SectionCard,
} from "@/components/superadmin/ui";
import { LEVELS } from "@/lib/util";

type SubscriptionBrief = {
  id: string;
  status: string;
  billingCycle: string;
  startDate: string;
  renewsAt: string;
  endsAt: string;
  plan: { id: string; name: string; code: string };
} | null;

type SchoolRow = {
  id: string;
  name: string;
  code: string;
  level: string;
  ownership: string;
  province: string;
  district: string;
  sector: string;
  address: string;
  officialEmail: string;
  officialPhone: string;
  status: string;
  statusReason: string;
  statusChangedAt: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  counts: {
    users: number;
    classes: number;
    plans: number;
    teachers: number;
    admins: number;
    disabledUsers: number;
  };
  subscription: SubscriptionBrief;
};

type ListResponse = {
  schools: SchoolRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  counts: Record<string, number>;
};

type SchoolUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  statusReason: string;
  lastLoginAt: string | null;
  createdAt: string;
  disabledAt: string | null;
};

type SubscriptionRecord = {
  id: string;
  status: string;
  billingCycle: string;
  startDate: string;
  renewsAt: string;
  endsAt: string;
  notes: string;
  createdAt: string;
  plan: {
    id: string;
    name: string;
    code: string;
    monthlyPrice: number;
    annualPrice: number;
    currency: string;
  };
};

type Payment = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  reference: string;
  paidAt: string | null;
  createdAt: string;
  subscription: { id: string; plan: { name: string } } | null;
};

type Detail = {
  school: {
    id: string;
    name: string;
    code: string;
    level: string;
    ownership: string;
    province: string;
    district: string;
    sector: string;
    cell: string;
    village: string;
    address: string;
    officialEmail: string;
    officialPhone: string;
    levels: string[];
    status: string;
    statusReason: string;
    statusChangedAt: string | null;
    createdAt: string;
    updatedAt: string;
    lastActiveAt: string | null;
  };
  counts: {
    users: number;
    teachers: number;
    admins: number;
    classes: number;
    plans: number;
    lessons: number;
    subjects: number;
    assignments: number;
    disabledUsers: number;
  };
  users: SchoolUser[];
  classes: { id: string; name: string; level: string | null; stream: string | null }[];
  academicYears: { id: string; label: string; startDate: string; endDate: string; isActive: boolean }[];
  subscription: SubscriptionRecord | null;
  subscriptionHistory: SubscriptionRecord[];
  payments: Payment[];
  recentLogs: {
    id: string;
    action: string;
    actorType: string;
    actorName: string;
    actorEmail: string;
    summary: string;
    createdAt: string;
  }[];
};

type EditForm = {
  name: string;
  code: string;
  level: string;
  ownership: string;
  province: string;
  district: string;
  sector: string;
  cell: string;
  village: string;
  address: string;
  officialEmail: string;
  officialPhone: string;
  levels: string[];
};

const EMPTY_EDIT: EditForm = {
  name: "",
  code: "",
  level: "combined",
  ownership: "private",
  province: "",
  district: "",
  sector: "",
  cell: "",
  village: "",
  address: "",
  officialEmail: "",
  officialPhone: "",
  levels: [],
};

const LEVEL_LABEL: Record<string, string> = {
  nursery: "Nursery",
  primary: "Primary",
  secondary: "Secondary",
  combined: "Combined",
};

const OWNERSHIP_LABEL: Record<string, string> = {
  public: "Public",
  aided: "Government-aided",
  private: "Private",
};

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
];

export default function SchoolsPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [ownership, setOwnership] = useState("");
  const [level, setLevel] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);

  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailId, setDetailId] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_EDIT);
  const [editBusy, setEditBusy] = useState(false);

  const [statusTarget, setStatusTarget] = useState<{ id: string; name: string; next: string; pending?: boolean } | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [statusBusy, setStatusBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteName, setDeleteName] = useState("");
  const [deleteScheduled, setDeleteScheduled] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20", sort });
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      if (ownership) params.set("ownership", ownership);
      if (level) params.set("level", level);
      const res = await saApi<ListResponse>(`/api/superadmin/schools?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load schools.");
    } finally {
      setLoading(false);
    }
  }, [page, q, status, ownership, level, sort]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = useCallback(
    async (id: string) => {
      setDetailId(id);
      setDetail(null);
      setDetailError("");
      setDetailLoading(true);
      try {
        const res = await saApi<Detail>(`/api/superadmin/schools/${id}`);
        setDetail(res);
      } catch (err) {
        setDetailError(err instanceof Error ? err.message : "Could not load this school.");
      } finally {
        setDetailLoading(false);
      }
    },
    []
  );

  /* Deep-link from the overview: /superadmin/schools?school=<id> */
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("school");
    if (id) openDetail(id);
  }, [openDetail]);

  const totals = useMemo(() => {
    const c = data?.counts ?? {};
    return {
      all:
        (c.pending ?? 0) +
        (c.active ?? 0) +
        (c.suspended ?? 0) +
        (c.deactivated ?? 0),
      pending: c.pending ?? 0,
      active: c.active ?? 0,
      suspended: c.suspended ?? 0,
      deactivated: c.deactivated ?? 0,
    };
  }, [data]);

  function resetPageAnd(fn: () => void) {
    fn();
    setPage(1);
  }

  function openEdit() {
    if (!detail) return;
    const s = detail.school;
    setEditForm({
      name: s.name,
      code: s.code,
      level: s.level || "combined",
      ownership: s.ownership || "private",
      province: s.province,
      district: s.district,
      sector: s.sector,
      cell: s.cell,
      village: s.village,
      address: s.address,
      officialEmail: s.officialEmail,
      officialPhone: s.officialPhone,
      levels: s.levels ?? [],
    });
    setEditOpen(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    if (!editForm.name.trim()) {
      toast("School name is required.", "err");
      return;
    }
    setEditBusy(true);
    try {
      await saApi(`/api/superadmin/schools/${detail.school.id}`, {
        method: "PATCH",
        body: editForm,
      });
      toast("School information updated.", "ok");
      setEditOpen(false);
      await Promise.all([openDetail(detail.school.id), load()]);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save changes.", "err");
    } finally {
      setEditBusy(false);
    }
  }

  async function applyStatus() {
    if (!statusTarget) return;
    const blocked = statusTarget.next !== "active";
    if (blocked && !statusReason.trim()) {
      toast("Please provide a reason for this action.", "err");
      return;
    }
    const verb =
      statusTarget.next === "active"
        ? statusTarget.pending
          ? "approve"
          : "reactivate"
        : statusTarget.next === "suspended"
          ? "suspend"
          : "deactivate";
    const ok = await confirm(
      `Are you sure you want to ${verb} “${statusTarget.name}”? ${
        blocked
          ? "Everyone at this school will be signed out and prevented from signing in."
          : statusTarget.pending
            ? "The workspace becomes active and a default subscription is assigned when subscriptions are enabled."
            : "Staff will be able to sign in again."
      }`,
      statusTarget.pending
        ? "Approve school"
        : verb === "reactivate"
          ? "Reactivate"
          : verb === "suspend"
            ? "Suspend school"
            : "Deactivate school"
    );
    if (!ok) return;

    setStatusBusy(true);
    try {
      const res = await saApi<{ revokedSessions: number }>(
        `/api/superadmin/schools/${statusTarget.id}/status`,
        { method: "POST", body: { status: statusTarget.next, reason: statusReason.trim() } }
      );
      toast(
        `School ${verb}d${res.revokedSessions ? ` · ${res.revokedSessions} session(s) revoked` : ""}.`,
        "ok"
      );
      setStatusTarget(null);
      setStatusReason("");
      await Promise.all([detail ? openDetail(detail.school.id) : Promise.resolve(), load()]);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not change school status.", "err");
    } finally {
      setStatusBusy(false);
    }
  }

  async function scheduleDeletion() {
    if (!detailSchool) return;
    setDeleteBusy(true);
    try { const r = await saApi<{ request: { scheduledFor: string } }>(`/api/superadmin/schools/${detailSchool.id}/deletion`, { method: "POST", body: { schoolName: deleteName, reason: deleteReason } }); setDeleteScheduled(r.request.scheduledFor); toast("Deletion scheduled with a grace period.", "ok"); }
    catch (e) { toast((e as Error).message, "err"); }
    setDeleteBusy(false);
  }
  async function cancelDeletion() {
    if (!detailSchool) return;
    setDeleteBusy(true);
    try { await saApi(`/api/superadmin/schools/${detailSchool.id}/deletion`, { method: "DELETE" }); setDeleteScheduled(null); toast("Pending deletion cancelled.", "ok"); }
    catch (e) { toast((e as Error).message, "err"); }
    setDeleteBusy(false);
  }
  async function executeDeletion() {
    if (!detailSchool) return;
    setDeleteBusy(true);
    try { await saApi(`/api/superadmin/schools/${detailSchool.id}/deletion`, { method: "PUT", body: { schoolName: deleteName } }); toast("School permanently deleted.", "ok"); setDeleteOpen(false); setDetailId(""); await load(); }
    catch (e) { toast((e as Error).message, "err"); }
    setDeleteBusy(false);
  }

  const detailSchool = detail?.school;

  return (
    <div className="stack">
      <SaPageHeader
        title="Schools"
        sub="Every school workspace on the platform, with subscription and tenant status. Suspending a school signs out all of its users immediately."
        actions={
          <button className="btn btn-sm" onClick={() => load()} disabled={loading}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
        }
      />

      <div className="filters">
        <div className="grow">
          <label className="field-label">Search</label>
          <SearchBox value={q} onChange={(v) => resetPageAnd(() => setQ(v))} placeholder="Name, code, district, email…" />
        </div>
        <div>
          <label className="field-label">Status</label>
          <select
            className="input"
            value={status}
            onChange={(e) => resetPageAnd(() => setStatus(e.target.value))}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending approval</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="deactivated">Deactivated</option>
          </select>
        </div>
        <div>
          <label className="field-label">Ownership</label>
          <select
            className="input"
            value={ownership}
            onChange={(e) => resetPageAnd(() => setOwnership(e.target.value))}
          >
            <option value="">All types</option>
            <option value="public">Public</option>
            <option value="aided">Government-aided</option>
            <option value="private">Private</option>
          </select>
        </div>
        <div>
          <label className="field-label">Level</label>
          <select className="input" value={level} onChange={(e) => resetPageAnd(() => setLevel(e.target.value))}>
            <option value="">All levels</option>
            <option value="nursery">Nursery</option>
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
            <option value="combined">Combined</option>
          </select>
        </div>
        <div>
          <label className="field-label">Sort</label>
          <select className="input" value={sort} onChange={(e) => resetPageAnd(() => setSort(e.target.value))}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="sa-seg" role="group" aria-label="Filter schools by status">
        {[
          { key: "", label: "All", count: totals.all },
          { key: "pending", label: "Pending", count: totals.pending },
          { key: "active", label: "Active", count: totals.active },
          { key: "suspended", label: "Suspended", count: totals.suspended },
          { key: "deactivated", label: "Deactivated", count: totals.deactivated },
        ].map((s) => (
          <button
            key={s.key || "all"}
            type="button"
            className={status === s.key ? "active" : ""}
            onClick={() => resetPageAnd(() => setStatus(s.key))}
          >
            {s.label} <span className="count">{fmtNumber(s.count)}</span>
          </button>
        ))}
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      <section className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>School</th>
                <th>Type</th>
                <th>People</th>
                <th>Subscription</th>
                <th>Created</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td colSpan={7}>
                    <Spinner />
                  </td>
                </tr>
              ) : !data || data.schools.length === 0 ? (
                <tr>
                  <td colSpan={7} className="sa-empty-row">
                    No schools match these filters.
                  </td>
                </tr>
              ) : (
                data.schools.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="sa-school-cell">
                        <span className="sa-avatar">{initials(s.name)}</span>
                        <span className="sa-cell-main">
                          <strong>{s.name}</strong>
                          <span>
                            {s.code ? `${s.code} · ` : ""}
                            {[s.district, s.sector].filter(Boolean).join(", ") || "No location recorded"}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="sa-chip-row">
                        <span className="sa-tag">{LEVEL_LABEL[s.level] ?? s.level ?? "—"}</span>
                        <span className="sa-tag">{OWNERSHIP_LABEL[s.ownership] ?? s.ownership ?? "—"}</span>
                      </div>
                    </td>
                    <td>
                      <div className="sa-row-title">
                        {fmtNumber(s.counts.teachers)} teachers · {fmtNumber(s.counts.admins)} admins
                      </div>
                      <div className="sa-row-sub">
                        {fmtNumber(s.counts.users)} accounts · {fmtNumber(s.counts.classes)} classes
                      </div>
                    </td>
                    <td>
                      {s.subscription ? (
                        <div className="sa-cell-main">
                          <span className="sa-inline">
                            <strong>{s.subscription.plan.name}</strong>
                            <StatusChip status={s.subscription.status} />
                          </span>
                          <span>{s.subscription.billingCycle === "annual" ? "Annual billing" : "Monthly billing"}</span>
                        </div>
                      ) : (
                        <span className="sa-tag">No subscription</span>
                      )}
                    </td>
                    <td>
                      <span className="sa-row-title">{fmtDate(s.createdAt)}</span>
                      <div className="sa-row-sub">
                        {s.lastActiveAt ? `Active ${timeAgo(s.lastActiveAt)}` : "Never signed in"}
                      </div>
                    </td>
                    <td>
                      <StatusChip status={s.status} />
                      {s.status !== "active" && s.statusReason ? (
                        <div className="sa-row-sub" style={{ maxWidth: 190 }}>
                          {s.statusReason}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div className="sa-table-actions">
                        <button className="btn btn-sm" onClick={() => openDetail(s.id)}>
                          <Icon name="eye" size={14} /> Manage
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data ? (
          <div style={{ padding: "0 16px 14px" }}>
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
          </div>
        ) : null}
      </section>

      {/* ---------------- school detail ---------------- */}
      {detailId ? (
        <Modal title={detailSchool ? detailSchool.name : "School profile"} onClose={() => setDetailId("")} maxWidth={900}>
          {detailLoading ? (
            <Spinner />
          ) : detailError ? (
            <div className="stack">
              <div className="form-error">{detailError}</div>
              <button className="btn" onClick={() => openDetail(detailId)}>
                Try again
              </button>
            </div>
          ) : detail && detailSchool ? (
            <div className="stack" style={{ gap: 18 }}>
              <div className="sa-detail-head">
                <span className="sa-avatar gold">{initials(detailSchool.name)}</span>
                <div className="sa-detail-name">
                  <h2>{detailSchool.name}</h2>
                  <p>
                    {detailSchool.code || "No school code"} · {LEVEL_LABEL[detailSchool.level] ?? detailSchool.level} ·{" "}
                    {OWNERSHIP_LABEL[detailSchool.ownership] ?? detailSchool.ownership}
                  </p>
                </div>
                <div className="sa-inline sa-inline-end">
                  <StatusChip status={detailSchool.status} />
                  <button className="btn btn-sm" onClick={openEdit}>
                    <Icon name="pencil" size={14} /> Edit info
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => { setDeleteName(""); setDeleteReason(""); setDeleteScheduled(null); setDeleteOpen(true); void saApi<{ request: { scheduledFor: string } | null }>(`/api/superadmin/schools/${detailSchool.id}/deletion`).then((d) => setDeleteScheduled(d.request?.scheduledFor ?? null)); }}><Icon name="trash" size={14} /> Delete School</button>
                  {detailSchool.status === "active" ? (
                    <>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() =>
                          setStatusTarget({ id: detailSchool.id, name: detailSchool.name, next: "suspended" })
                        }
                      >
                        <Icon name="pause" size={14} /> Suspend
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() =>
                          setStatusTarget({ id: detailSchool.id, name: detailSchool.name, next: "deactivated" })
                        }
                      >
                        <Icon name="xCircle" size={14} /> Deactivate
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() =>
                        setStatusTarget({ id: detailSchool.id, name: detailSchool.name, next: "active", pending: detailSchool.status === "pending" })
                      }
                    >
                      <Icon name={detailSchool.status === "pending" ? "check" : "play"} size={14} />{" "}
                      {detailSchool.status === "pending" ? "Approve & activate" : "Reactivate"}
                    </button>
                  )}
                </div>
              </div>

              {detailSchool.status !== "active" ? (
                <div className="sa-callout warn">
                  <Icon name="warning" size={16} />
                  <span>
                    This workspace is <strong>{detailSchool.status}</strong>
                    {detailSchool.statusReason ? `: ${detailSchool.statusReason}` : "."} Its users cannot sign in
                    until it is reactivated.
                  </span>
                </div>
              ) : null}

              <div className="sa-detail-grid">
                <InfoItem label="Province" value={detailSchool.province} />
                <InfoItem label="District" value={detailSchool.district} />
                <InfoItem label="Sector" value={detailSchool.sector} />
                <InfoItem label="Cell" value={detailSchool.cell} />
                <InfoItem label="Village" value={detailSchool.village} />
                <InfoItem label="Address" value={detailSchool.address} />
                <InfoItem label="Official email" value={detailSchool.officialEmail} />
                <InfoItem label="Official phone" value={detailSchool.officialPhone} />
                <InfoItem label="Registered" value={fmtDate(detailSchool.createdAt)} />
                <InfoItem label="Last activity" value={detailSchool.lastActiveAt ? timeAgo(detailSchool.lastActiveAt) : "—"} />
              </div>

              <div className="stat-grid">
                <div className="stat">
                  <div className="num">{fmtNumber(detail.counts.teachers)}</div>
                  <div className="lbl">Teachers</div>
                </div>
                <div className="stat">
                  <div className="num">{fmtNumber(detail.counts.admins)}</div>
                  <div className="lbl">Administrators</div>
                </div>
                <div className="stat">
                  <div className="num">{fmtNumber(detail.counts.classes)}</div>
                  <div className="lbl">Classes</div>
                </div>
                <div className="stat">
                  <div className="num">{fmtNumber(detail.counts.plans)}</div>
                  <div className="lbl">Lesson plans</div>
                </div>
                <div className="stat">
                  <div className="num">{fmtNumber(detail.counts.lessons)}</div>
                  <div className="lbl">Lessons</div>
                </div>
                <div className="stat">
                  <div className="num">{fmtNumber(detail.counts.assignments)}</div>
                  <div className="lbl">Assignments</div>
                </div>
              </div>

              <SectionCard title="Subscription" icon="creditCard">
                {detail.subscription ? (
                  <div className="sa-detail-grid">
                    <InfoItem label="Plan" value={detail.subscription.plan.name} />
                    <InfoItem label="Status" value={<StatusChip status={detail.subscription.status} />} />
                    <InfoItem
                      label="Billing"
                      value={detail.subscription.billingCycle === "annual" ? "Annual" : "Monthly"}
                    />
                    <InfoItem label="Started" value={fmtDate(detail.subscription.startDate)} />
                    <InfoItem label="Renews" value={fmtDate(detail.subscription.renewsAt)} />
                    <InfoItem label="Ends" value={fmtDate(detail.subscription.endsAt)} />
                    <InfoItem
                      label="Plan price"
                      value={fmtMoney(
                        detail.subscription.billingCycle === "annual"
                          ? detail.subscription.plan.annualPrice
                          : detail.subscription.plan.monthlyPrice,
                        detail.subscription.plan.currency
                      )}
                    />
                    <InfoItem label="Notes" value={detail.subscription.notes} />
                  </div>
                ) : (
                  <div className="sa-callout">
                    <Icon name="info" size={16} />
                    <span>
                      No subscription is assigned.{" "}
                      <Link href="/super-admin/subscriptions">Assign one from Subscriptions &amp; Billing</Link>.
                    </span>
                  </div>
                )}
                {detail.subscriptionHistory.length > 1 ? (
                  <div style={{ marginTop: 12 }}>
                    <div className="sa-row-sub" style={{ marginBottom: 6 }}>
                      Earlier subscriptions
                    </div>
                    <div className="sa-chip-row">
                      {detail.subscriptionHistory
                        .filter((s) => s.id !== detail.subscription?.id)
                        .map((s) => (
                          <span key={s.id} className="sa-tag">
                            {s.plan.name} · {s.status} · {fmtDate(s.startDate)}
                          </span>
                        ))}
                    </div>
                  </div>
                ) : null}
              </SectionCard>

              <div className="grid-2">
                <SectionCard
                  title={`Users (${detail.counts.users})`}
                  icon="users"
                  action={
                    <Link className="btn btn-sm" href={`/super-admin/users?schoolId=${detailSchool.id}`}>
                      Manage users
                    </Link>
                  }
                >
                  {detail.users.length === 0 ? (
                    <p className="muted">No users in this school yet.</p>
                  ) : (
                    <div className="sa-recent-list">
                      {detail.users.slice(0, 8).map((u) => (
                        <div key={u.id} className="sa-recent-row static">
                          <span className="sa-avatar">{initials(u.name)}</span>
                          <span className="sa-recent-main">
                            <strong>
                              {u.name} · <span style={{ fontWeight: 500 }}>{u.role}</span>
                            </strong>
                            <span>{u.email}</span>
                          </span>
                          <span className="sa-recent-meta">
                            <StatusChip status={u.status} />
                            <span>{u.lastLoginAt ? `Last seen ${timeAgo(u.lastLoginAt)}` : "Never signed in"}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {detail.users.length > 8 ? (
                    <p className="sa-table-note">Showing the first 8 accounts. Use “Manage users” for the full list.</p>
                  ) : null}
                </SectionCard>

                <SectionCard title="Recent activity" icon="activity">
                  {detail.recentLogs.length === 0 ? (
                    <p className="muted">No activity recorded for this school yet.</p>
                  ) : (
                    <div className="sa-recent-list">
                      {detail.recentLogs.slice(0, 8).map((log) => (
                        <div key={log.id} className="sa-recent-row static">
                          <span className="sa-log-ico">
                            <Icon name={log.action.startsWith("auth") ? "shield" : "activity"} size={15} />
                          </span>
                          <span className="sa-recent-main">
                            <strong>{log.summary || log.action}</strong>
                            <span>
                              {log.actorName || log.actorEmail || "System"} · {log.action}
                            </span>
                          </span>
                          <span className="sa-recent-time">{timeAgo(log.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>

              <SectionCard title={`Recorded payments (${detail.payments.length})`} icon="creditCard">
                {detail.payments.length === 0 ? (
                  <p className="muted">No payments have been recorded for this school.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Amount</th>
                          <th>Status</th>
                          <th>Method</th>
                          <th>Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.payments.map((p) => (
                          <tr key={p.id}>
                            <td>{fmtDate(p.paidAt || p.createdAt)}</td>
                            <td className="sa-price">{fmtMoney(p.amount, p.currency)}</td>
                            <td>
                              <StatusChip status={p.status} />
                            </td>
                            <td>{p.method || "—"}</td>
                            <td className="sa-mono">{p.reference || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>

              <p className="sa-note">
                Created {fmtDateTime(detailSchool.createdAt)} · Last updated {fmtDateTime(detailSchool.updatedAt)}
              </p>
            </div>
          ) : null}
        </Modal>
      ) : null}

      {/* ---------------- edit school ---------------- */}
      {editOpen && detail ? (
        <Modal title={`Edit ${detail.school.name}`} onClose={() => setEditOpen(false)} maxWidth={720}>
          <form onSubmit={saveEdit} className="stack" style={{ gap: 14 }}>
            <div className="sa-two">
              <div>
                <label className="field-label">School name</label>
                <input
                  className="input"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="field-label">School code</label>
                <input
                  className="input"
                  value={editForm.code}
                  onChange={(e) => setEditForm((f) => ({ ...f, code: e.target.value }))}
                />
              </div>
            </div>
            <div className="sa-two">
              <div>
                <label className="field-label">Level</label>
                <select
                  className="input"
                  value={editForm.level}
                  onChange={(e) => setEditForm((f) => ({ ...f, level: e.target.value }))}
                >
                  {Object.entries(LEVEL_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Ownership</label>
                <select
                  className="input"
                  value={editForm.ownership}
                  onChange={(e) => setEditForm((f) => ({ ...f, ownership: e.target.value }))}
                >
                  {Object.entries(OWNERSHIP_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-grid-3">
              {(
                [
                  ["province", "Province"],
                  ["district", "District"],
                  ["sector", "Sector"],
                  ["cell", "Cell"],
                  ["village", "Village"],
                  ["address", "Address"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="field-label">{label}</label>
                  <input
                    className="input"
                    value={editForm[key]}
                    onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="sa-two">
              <div>
                <label className="field-label">Official email</label>
                <input
                  className="input"
                  type="email"
                  value={editForm.officialEmail}
                  onChange={(e) => setEditForm((f) => ({ ...f, officialEmail: e.target.value }))}
                />
              </div>
              <div>
                <label className="field-label">Official phone</label>
                <input
                  className="input"
                  value={editForm.officialPhone}
                  onChange={(e) => setEditForm((f) => ({ ...f, officialPhone: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="field-label">Class levels offered</label>
              <div className="sa-chip-row" style={{ gap: 10 }}>
                {LEVELS.map((l) => (
                  <label key={l.id} className="sa-check">
                    <input
                      type="checkbox"
                      checked={editForm.levels.includes(l.id)}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          levels: e.target.checked
                            ? Array.from(new Set([...f.levels, l.id]))
                            : f.levels.filter((x) => x !== l.id),
                        }))
                      }
                    />
                    {l.id}
                  </label>
                ))}
              </div>
            </div>
            <div className="modal__actions">
              <button type="button" className="btn" onClick={() => setEditOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={editBusy}>
                {editBusy ? <span className="sa-spin" /> : <Icon name="check" size={15} />}
                Save changes
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {/* ---------------- status change ---------------- */}
      {statusTarget ? (
        <Modal
          title={
            statusTarget.next === "active"
              ? statusTarget.pending
                ? "Approve school registration"
                : "Reactivate school"
              : statusTarget.next === "suspended"
                ? "Suspend school"
                : "Deactivate school"
          }
          onClose={() => {
            setStatusTarget(null);
            setStatusReason("");
          }}
          maxWidth={480}
        >
          <div className="stack" style={{ gap: 14 }}>
            <div className={statusTarget.next === "active" ? "sa-callout" : "sa-callout warn"}>
              <Icon name={statusTarget.next === "active" ? "checkCircle" : "warning"} size={16} />
              <span>
                {statusTarget.next === "active"
                  ? statusTarget.pending
                    ? `“${statusTarget.name}” will be approved and its administrator can sign in immediately.`
                    : `“${statusTarget.name}” will be able to sign in again immediately.`
                  : `Every user at “${statusTarget.name}” will be signed out and blocked from signing in. No data is deleted.`}
              </span>
            </div>
            {statusTarget.next !== "active" ? (
              <div>
                <label className="field-label">Reason (stored in the audit log)</label>
                <textarea
                  className="input"
                  rows={3}
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="e.g. Unpaid invoice, policy violation, school closure…"
                />
              </div>
            ) : null}
            <div className="modal__actions">
              <button
                className="btn"
                onClick={() => {
                  setStatusTarget(null);
                  setStatusReason("");
                }}
              >
                Cancel
              </button>
              <button
                className={"btn " + (statusTarget.next === "active" ? "btn-primary" : "btn-danger")}
                onClick={applyStatus}
                disabled={statusBusy}
              >
                {statusBusy ? <span className="sa-spin" /> : <Icon name="check" size={15} />}
                {statusTarget.next === "active"
                  ? statusTarget.pending
                    ? "Approve school"
                    : "Reactivate school"
                  : statusTarget.next === "suspended"
                    ? "Suspend school"
                    : "Deactivate school"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {deleteOpen && detailSchool ? <Modal title={`Delete ${detailSchool.name}`} onClose={() => setDeleteOpen(false)} maxWidth={560}><div className="stack"><p>This permanently removes this school's users, classes, plans, messages, comments, and associated database records. A configured grace period applies before final deletion. Retained backups are purged according to hosting retention policy.</p>{deleteScheduled ? <><p>Scheduled for {fmtDateTime(deleteScheduled)}. This school remains recoverable during the grace period.</p><label className="field-label">Enter {detailSchool.name} to execute after the grace period</label><input className="input" value={deleteName} onChange={(e) => setDeleteName(e.target.value)} /><div className="modal__actions"><button className="btn" onClick={() => void cancelDeletion()} disabled={deleteBusy}>Cancel pending deletion</button><button className="btn btn-danger" onClick={() => void executeDeletion()} disabled={deleteBusy || deleteName !== detailSchool.name}>Permanently delete</button></div></> : <><label className="field-label">Reason</label><textarea className="input" rows={3} value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} /><label className="field-label">Type {detailSchool.name} to schedule deletion</label><input className="input" value={deleteName} onChange={(e) => setDeleteName(e.target.value)} /><div className="modal__actions"><button className="btn" onClick={() => setDeleteOpen(false)}>Cancel</button><button className="btn btn-danger" disabled={deleteBusy || !deleteReason.trim() || deleteName !== detailSchool.name} onClick={() => void scheduleDeletion()}>Schedule deletion</button></div></>}</div></Modal> : null}
    </div>
  );
}
