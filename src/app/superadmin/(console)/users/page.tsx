"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Modal, Spinner, useConfirm, useToast } from "@/components/ui";
import {
  saApi,
  copyText,
  fmtDate,
  fmtDateTime,
  fmtNumber,
  initials,
  timeAgo,
} from "@/lib/superadmin-client";
import { SaPageHeader, StatusChip, SearchBox, Pagination } from "@/components/superadmin/ui";

type SchoolBrief = { id: string; name: string; code: string; status: string };

type UserRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  statusReason: string;
  disabledAt: string | null;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  createdAt: string;
  schoolId: string;
  school: SchoolBrief;
};

type ListResponse = {
  users: UserRow[];
  schools: SchoolBrief[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  counts: Record<string, number>;
};

type RecoveryResponse = {
  link: string;
  token: string;
  expiresAt: string;
  user: { id: string; name: string; email: string };
};

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
];

export default function UsersPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);

  const [target, setTarget] = useState<{ user: UserRow; next: string } | null>(null);
  const [reason, setReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const [recovery, setRecovery] = useState<RecoveryResponse | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "25", sort });
      if (q.trim()) params.set("q", q.trim());
      if (schoolId) params.set("schoolId", schoolId);
      if (role) params.set("role", role);
      if (status) params.set("status", status);
      const res = await saApi<ListResponse>(`/api/superadmin/users?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load users.");
    } finally {
      setLoading(false);
    }
  }, [page, q, schoolId, role, status, sort]);

  useEffect(() => {
    load();
  }, [load]);

  /* Deep link from a school profile: /superadmin/users?schoolId=<id> */
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("schoolId");
    if (id) setSchoolId(id);
  }, []);

  const counts = useMemo(() => {
    const c = data?.counts ?? {};
    return {
      all: (c.active ?? 0) + (c.disabled ?? 0),
      active: c.active ?? 0,
      disabled: c.disabled ?? 0,
    };
  }, [data]);

  const activeSchool = data?.schools.find((s) => s.id === schoolId);

  function resetPageAnd(fn: () => void) {
    fn();
    setPage(1);
  }

  async function applyStatus() {
    if (!target) return;
    const disabling = target.next === "disabled";
    if (disabling && !reason.trim()) {
      toast("Please provide a reason for disabling this account.", "err");
      return;
    }
    const ok = await confirm(
      disabling
        ? `Disable ${target.user.name} (${target.user.email})? They will be signed out immediately and cannot sign in until reactivated.`
        : `Reactivate ${target.user.name} (${target.user.email})? They will be able to sign in again.`,
      disabling ? "Disable account" : "Reactivate"
    );
    if (!ok) return;

    setActionBusy(true);
    try {
      const res = await saApi<{ revokedSessions: number }>(`/api/superadmin/users/${target.user.id}`, {
        method: "PATCH",
        body: { status: target.next, reason: reason.trim() },
      });
      toast(
        `Account ${disabling ? "disabled" : "reactivated"}${
          res.revokedSessions ? ` · ${res.revokedSessions} session(s) revoked` : ""
        }.`,
        "ok"
      );
      setTarget(null);
      setReason("");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not change this account.", "err");
    } finally {
      setActionBusy(false);
    }
  }

  async function issueRecovery(user: UserRow) {
    const ok = await confirm(
      `Issue a one-time password recovery link for ${user.name} (${user.email})? The link is valid for one hour and can only be used once.`,
      "Issue link"
    );
    if (!ok) return null;
    setRecoveryBusy(true);
    try {
      const res = await saApi<RecoveryResponse>(`/api/superadmin/users/${user.id}/recovery`, {
        method: "POST",
      });
      setRecovery(res);
      toast("Recovery link created. Deliver it to the user out-of-band.", "ok");
      return res;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not create a recovery link.", "err");
      return null;
    } finally {
      setRecoveryBusy(false);
    }
  }

  async function copyRecovery() {
    if (!recovery) return;
    const full = `${window.location.origin}${recovery.link}`;
    const copied = await copyText(full);
    toast(copied ? "Recovery link copied." : "Could not copy — select the link manually.", copied ? "ok" : "err");
  }

  return (
    <div className="stack">
      <SaPageHeader
        title="Users"
        sub="Every administrator and teacher across all school workspaces. Accounts belong to one school and can never be moved between tenants."
        actions={
          <button className="btn btn-sm" onClick={() => load()} disabled={loading}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
        }
      />

      <div className="filters">
        <div className="grow">
          <label className="field-label">Search</label>
          <SearchBox
            value={q}
            onChange={(v) => resetPageAnd(() => setQ(v))}
            placeholder="Name, email, phone, school…"
          />
        </div>
        <div>
          <label className="field-label">School</label>
          <select
            className="input"
            value={schoolId}
            onChange={(e) => resetPageAnd(() => setSchoolId(e.target.value))}
          >
            <option value="">All schools</option>
            {(data?.schools ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.code ? ` (${s.code})` : ""}
                {s.status !== "active" ? ` — ${s.status}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Role</label>
          <select className="input" value={role} onChange={(e) => resetPageAnd(() => setRole(e.target.value))}>
            <option value="">All roles</option>
            <option value="admin">Administrators</option>
            <option value="teacher">Teachers</option>
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

      <div className="sa-toolbar">
        <div className="sa-seg" role="group" aria-label="Filter users by status">
          {[
            { key: "", label: "All", count: counts.all },
            { key: "active", label: "Active", count: counts.active },
            { key: "disabled", label: "Disabled", count: counts.disabled },
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
        {activeSchool ? (
          <span className="sa-top-chip">
            <Icon name="school" size={13} />
            {activeSchool.name}
            <button
              type="button"
              className="sa-search__clear"
              aria-label="Clear school filter"
              onClick={() => resetPageAnd(() => setSchoolId(""))}
            >
              <Icon name="x" size={12} />
            </button>
          </span>
        ) : null}
        <span className="sa-toolbar-end">
          <span className="sa-updated">
            {data ? `${fmtNumber(data.total)} matching account${data.total === 1 ? "" : "s"}` : ""}
          </span>
        </span>
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      <section className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>School</th>
                <th>Role</th>
                <th>Last sign-in</th>
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
              ) : !data || data.users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="sa-empty-row">
                    No users match these filters.
                  </td>
                </tr>
              ) : (
                data.users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="sa-school-cell">
                        <span className={"sa-avatar" + (u.role === "admin" ? " gold" : "")}>{initials(u.name)}</span>
                        <span className="sa-cell-main">
                          <strong>{u.name}</strong>
                          <span>{u.email}</span>
                          {u.phone ? <span>{u.phone}</span> : null}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="sa-cell-main">
                        <strong>{u.school.name}</strong>
                        <span>
                          {u.school.code || "No school code"}
                          {u.school.status !== "active" ? ` · ${u.school.status}` : ""}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={"sa-tag" + (u.role === "admin" ? " gold" : "")}>
                        {u.role === "admin" ? "Administrator" : "Teacher"}
                      </span>
                      {u.mustChangePassword ? <div className="sa-row-sub">Temp password</div> : null}
                    </td>
                    <td>
                      <span className="sa-row-title">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : "Never"}</span>
                      <div className="sa-row-sub">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "No sign-in recorded"}</div>
                    </td>
                    <td>
                      <span className="sa-row-title">{fmtDate(u.createdAt)}</span>
                    </td>
                    <td>
                      <StatusChip status={u.status} />
                      {u.status === "disabled" && u.statusReason ? (
                        <div className="sa-row-sub" style={{ maxWidth: 190 }}>
                          {u.statusReason}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div className="sa-table-actions">
                        <button
                          className="btn btn-sm"
                          title="Issue one-time recovery link"
                          onClick={() => issueRecovery(u)}
                          disabled={recoveryBusy || u.status !== "active"}
                        >
                          <Icon name="key" size={14} /> Recovery
                        </button>
                        {u.status === "active" ? (
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => {
                              setReason("");
                              setTarget({ user: u, next: "disabled" });
                            }}
                          >
                            <Icon name="user" size={14} /> Disable
                          </button>
                        ) : (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => {
                              setReason("");
                              setTarget({ user: u, next: "active" });
                            }}
                          >
                            <Icon name="play" size={14} /> Reactivate
                          </button>
                        )}
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

      <p className="sa-note">
        Disabling an account signs the person out everywhere and blocks new sign-ins. The school&apos;s last active
        administrator cannot be disabled. <Link href="/super-admin/logs">Every change is audited.</Link>
      </p>

      {/* ---------------- status change ---------------- */}
      {target ? (
        <Modal
          title={target.next === "disabled" ? "Disable account" : "Reactivate account"}
          onClose={() => {
            setTarget(null);
            setReason("");
          }}
          maxWidth={480}
        >
          <div className="stack" style={{ gap: 14 }}>
            <div className={target.next === "disabled" ? "sa-callout warn" : "sa-callout"}>
              <Icon name={target.next === "disabled" ? "warning" : "checkCircle"} size={16} />
              <span>
                {target.next === "disabled"
                  ? `${target.user.name} will be signed out of every device immediately and blocked from signing in. Their lesson plans are kept.`
                  : `${target.user.name} will be able to sign in to ${target.user.school.name} again.`}
              </span>
            </div>
            <div className="sa-detail-grid">
              <div className="sa-info">
                <span>Account</span>
                <strong>{target.user.email}</strong>
              </div>
              <div className="sa-info">
                <span>School</span>
                <strong>{target.user.school.name}</strong>
              </div>
            </div>
            {target.next === "disabled" ? (
              <div>
                <label className="field-label">Reason (stored in the audit log)</label>
                <textarea
                  className="input"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Left the school, suspected account compromise…"
                />
              </div>
            ) : null}
            <div className="modal__actions">
              <button
                className="btn"
                onClick={() => {
                  setTarget(null);
                  setReason("");
                }}
              >
                Cancel
              </button>
              <button
                className={"btn " + (target.next === "disabled" ? "btn-danger" : "btn-primary")}
                onClick={applyStatus}
                disabled={actionBusy}
              >
                {actionBusy ? <span className="sa-spin" /> : <Icon name="check" size={15} />}
                {target.next === "disabled" ? "Disable account" : "Reactivate account"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* ---------------- recovery link ---------------- */}
      {recovery ? (
        <Modal title="One-time recovery link" onClose={() => setRecovery(null)} maxWidth={560}>
          <div className="stack" style={{ gap: 14 }}>
            <div className="sa-callout">
              <Icon name="key" size={16} />
              <span>
                Give this link to <strong>{recovery.user.name}</strong> ({recovery.user.email}) through a trusted
                channel. It expires {fmtDateTime(recovery.expiresAt)} and can be used only once. No password is shown
                here.
              </span>
            </div>
            <div>
              <label className="field-label">Recovery link</label>
              <div className="sa-search" style={{ height: "auto", padding: "8px 10px" }}>
                <input
                  readOnly
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}${recovery.link}`}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button type="button" className="btn btn-sm" onClick={copyRecovery}>
                  <Icon name="copy" size={13} /> Copy
                </button>
              </div>
            </div>
            <div className="modal__actions">
              <button className="btn" onClick={() => setRecovery(null)}>
                Done
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const url = `${window.location.origin}${recovery.link}`;
                  window.open(url, "_blank", "noopener,noreferrer");
                }}
              >
                <Icon name="globe" size={15} /> Open link
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
