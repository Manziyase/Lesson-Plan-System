"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Spinner } from "@/components/ui";
import { saApi, fmtDateTime, fmtNumber, timeAgo } from "@/lib/superadmin-client";
import { SaPageHeader, StatCard, SearchBox, Pagination } from "@/components/superadmin/ui";

type LogRow = {
  id: string;
  actorType: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  schoolId: string;
  schoolName: string;
  summary: string;
  metadata: Record<string, unknown>;
  ip: string;
  userAgent: string;
  createdAt: string;
};

type LogsResponse = {
  logs: LogRow[];
  actions: string[];
  actorTypes: { type: string; count: number }[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};

type SchoolBrief = { id: string; name: string; code: string };

function actionIcon(action: string): IconName {
  if (action.startsWith("auth")) return "shield";
  if (action.startsWith("school")) return "school";
  if (action.startsWith("user")) return "users";
  if (action.startsWith("platform_admin")) return "shield";
  if (action.startsWith("subscription") || action.startsWith("payment")) return "creditCard";
  if (action.startsWith("announcement")) return "megaphone";
  if (action.startsWith("plan")) return "layers";
  if (action.startsWith("platform.settings")) return "settings";
  if (action.includes("error") || action.includes("failed")) return "warning";
  return "activity";
}

function actionTone(action: string): string {
  if (action.includes("failed") || action.includes("error") || action.includes("blocked")) return "warn";
  if (action.includes("disable") || action.includes("suspend") || action.includes("cancel") || action.includes("delete"))
    return "danger";
  return "";
}

function actorLabel(type: string): string {
  if (type === "platform_admin") return "Super admin";
  if (type === "school_user") return "School user";
  if (type === "system") return "System";
  return type;
}

function csvEscape(value: unknown): string {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function LogsPage() {
  const [data, setData] = useState<LogsResponse | null>(null);
  const [schools, setSchools] = useState<SchoolBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [actorType, setActorType] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "40" });
      if (q.trim()) params.set("q", q.trim());
      if (action) params.set("action", action);
      if (actorType) params.set("actorType", actorType);
      if (schoolId) params.set("schoolId", schoolId);
      if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
      if (to) params.set("to", new Date(`${to}T23:59:59`).toISOString());
      const res = await saApi<LogsResponse>(`/api/superadmin/logs?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the audit log.");
    } finally {
      setLoading(false);
    }
  }, [page, q, action, actorType, schoolId, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    /* The users endpoint returns the full school lookup list (up to 1,000). */
    saApi<{ schools: SchoolBrief[] }>("/api/superadmin/users?pageSize=1")
      .then((res) => setSchools(res.schools ?? []))
      .catch(() => setSchools([]));
  }, []);

  const actorCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of data?.actorTypes ?? []) map[a.type] = a.count;
    return map;
  }, [data]);

  const hasFilters = !!(q || action || actorType || schoolId || from || to);

  function resetPageAnd(fn: () => void) {
    fn();
    setPage(1);
  }

  function clearFilters() {
    setQ("");
    setAction("");
    setActorType("");
    setSchoolId("");
    setFrom("");
    setTo("");
    setPage(1);
  }

  function exportCsv() {
    if (!data?.logs.length) return;
    const header = [
      "timestamp",
      "actor_type",
      "actor_name",
      "actor_email",
      "action",
      "target_type",
      "target_id",
      "school",
      "summary",
      "ip",
    ];
    const lines = data.logs.map((l) =>
      [
        l.createdAt,
        l.actorType,
        l.actorName,
        l.actorEmail,
        l.action,
        l.targetType,
        l.targetId,
        l.schoolName,
        l.summary,
        l.ip,
      ]
        .map(csvEscape)
        .join(",")
    );
    const csv = [header.join(","), ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lessonhub-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="stack">
      <SaPageHeader
        title="Activity & Audit Logs"
        sub="Every sensitive platform action, school registration, authentication event and security failure. Entries are append-only and never include passwords, tokens or secrets."
        actions={
          <>
            <button className="btn btn-sm" onClick={() => load()} disabled={loading}>
              <Icon name="refresh" size={14} /> Refresh
            </button>
            <button className="btn btn-sm" onClick={exportCsv} disabled={!data?.logs.length}>
              <Icon name="download" size={14} /> Export CSV
            </button>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard icon="activity" label="Audited events" value={data?.total ?? 0} sub="Matching the current filters" />
        <StatCard icon="shield" label="Super admin actions" value={actorCounts.platform_admin ?? 0} tone="warn" sub="All-time" />
        <StatCard icon="users" label="School user events" value={actorCounts.school_user ?? 0} sub="Logins and account activity" />
        <StatCard icon="server" label="System events" value={actorCounts.system ?? 0} sub="Automatic and background actions" />
      </div>

      <div className="filters">
        <div className="grow">
          <label className="field-label">Search</label>
          <SearchBox
            value={q}
            onChange={(v) => resetPageAnd(() => setQ(v))}
            placeholder="Summary, actor, action, target…"
          />
        </div>
        <div>
          <label className="field-label">Action</label>
          <select className="input" value={action} onChange={(e) => resetPageAnd(() => setAction(e.target.value))}>
            <option value="">All actions</option>
            {(data?.actions ?? []).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Actor</label>
          <select
            className="input"
            value={actorType}
            onChange={(e) => resetPageAnd(() => setActorType(e.target.value))}
          >
            <option value="">All actors</option>
            <option value="platform_admin">Super admins</option>
            <option value="school_user">School users</option>
            <option value="system">System</option>
          </select>
        </div>
        <div>
          <label className="field-label">School</label>
          <select className="input" value={schoolId} onChange={(e) => resetPageAnd(() => setSchoolId(e.target.value))}>
            <option value="">All schools</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.code ? ` (${s.code})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">From</label>
          <input className="input" type="date" value={from} onChange={(e) => resetPageAnd(() => setFrom(e.target.value))} />
        </div>
        <div>
          <label className="field-label">To</label>
          <input className="input" type="date" value={to} onChange={(e) => resetPageAnd(() => setTo(e.target.value))} />
        </div>
        {hasFilters ? (
          <div>
            <label className="field-label">&nbsp;</label>
            <button className="btn" onClick={clearFilters}>
              <Icon name="x" size={14} /> Clear
            </button>
          </div>
        ) : null}
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      <section className="card">
        <div className="sa-card-head">
          <div className="sa-card-title">
            <span className="ico" aria-hidden="true">
              <Icon name="activity" size={16} />
            </span>
            <h3>Event stream</h3>
          </div>
          <span className="sa-updated">
            {data ? `${fmtNumber(data.total)} event${data.total === 1 ? "" : "s"}` : ""}
          </span>
        </div>

        {loading && !data ? (
          <Spinner />
        ) : !data || data.logs.length === 0 ? (
          <p className="muted">No audit events match these filters.</p>
        ) : (
          <div className="sa-log-list">
            {data.logs.map((log) => {
              const tone = actionTone(log.action);
              return (
                <div key={log.id} className="sa-log-row">
                  <span
                    className="sa-log-ico"
                    style={
                      tone === "warn"
                        ? { background: "var(--color-warning-soft)", color: "var(--color-warning)" }
                        : tone === "danger"
                          ? { background: "var(--color-danger-soft)", color: "var(--color-danger)" }
                          : undefined
                    }
                  >
                    <Icon name={actionIcon(log.action)} size={15} />
                  </span>
                  <div className="sa-log-body">
                    <strong>{log.summary || log.action}</strong>
                    <div className="meta">
                      <code>{log.action}</code>
                      <span>
                        {log.actorName || actorLabel(log.actorType)}
                        {log.actorEmail ? ` · ${log.actorEmail}` : ""}
                      </span>
                      {log.schoolName ? <span>· {log.schoolName}</span> : null}
                      {log.targetType ? (
                        <span>
                          · {log.targetType}
                          {log.targetId ? ` ${log.targetId.slice(0, 18)}` : ""}
                        </span>
                      ) : null}
                      {log.ip ? <span>· {log.ip}</span> : null}
                    </div>
                    {log.metadata && Object.keys(log.metadata).length > 0 ? (
                      <details>
                        <summary style={{ cursor: "pointer", fontSize: "0.73rem", color: "var(--color-royal-600)" }}>
                          Details
                        </summary>
                        <pre className="sa-json">{JSON.stringify(log.metadata, null, 2)}</pre>
                      </details>
                    ) : null}
                  </div>
                  <div className="sa-log-time" title={fmtDateTime(log.createdAt)}>
                    {timeAgo(log.createdAt)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {data ? <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} /> : null}
      </section>

      <p className="sa-note">
        Audit entries record who did what, when, from which address, and against which tenant. Metadata never contains
        password hashes, MFA secrets, recovery tokens or provider credentials.
      </p>
    </div>
  );
}
