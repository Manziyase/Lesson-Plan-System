"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { Spinner } from "@/components/ui";
import { saApi, fmtDateTime, fmtNumber, timeAgo, bytes } from "@/lib/superadmin-client";
import { SaPageHeader, StatCard, SectionCard } from "@/components/superadmin/ui";

type Monitoring = {
  generatedAt: string;
  health: {
    ok: boolean;
    database: { ok: boolean; latencyMs: number; error: string };
    uptimeSeconds: number;
    nodeVersion: string;
    platform: string;
    memory: {
      rssMb: number;
      heapUsedMb: number;
      heapTotalMb: number;
      systemTotalMb: number;
      systemFreeMb: number;
    };
    environment: string;
  };
  storage: {
    databaseBytes: number;
    tables: { name: string; bytes: number; rows: number }[];
  };
  counts: {
    schools: number;
    users: number;
    teachers: number;
    plans: number;
    lessons: number;
    subjects: number;
    assignments: number;
    subscriptions: number;
    payments: number;
    announcements: number;
    auditLogs: number;
    tenantSessions: number;
    platformSessions: number;
    recoveryTokens: number;
  };
  last24h: { logins: number; failedLogins: number; registrations: number; plansCreated: number };
  errors: {
    id: string;
    action: string;
    actorName: string;
    actorEmail: string;
    summary: string;
    ip: string;
    createdAt: string;
  }[];
};

function uptime(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function MonitoringPage() {
  const [data, setData] = useState<Monitoring | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [auto, setAuto] = useState(true);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const res = await saApi<Monitoring>("/api/superadmin/monitoring");
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read system health.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => load(true), 30_000);
    return () => clearInterval(timer);
  }, [auto, load]);

  const maxTableBytes = useMemo(
    () => Math.max(1, ...(data?.storage.tables ?? []).map((t) => t.bytes)),
    [data]
  );

  if (loading && !data) return <Spinner />;

  if (!data) {
    return (
      <div className="stack">
        <SaPageHeader title="System Monitoring" sub="Live platform health and database usage." />
        <div className="form-error">{error || "System health could not be loaded."}</div>
        <button className="btn btn-primary" onClick={() => load()}>
          <Icon name="refresh" size={15} /> Try again
        </button>
      </div>
    );
  }

  const h = data.health;
  const memPct = h.memory.systemTotalMb
    ? Math.min(100, Math.round((h.memory.rssMb / h.memory.systemTotalMb) * 100))
    : 0;

  return (
    <div className="stack">
      <SaPageHeader
        title="System Monitoring"
        sub="Live health of the application process and PostgreSQL database, with record counts and last-24-hour activity."
        actions={
          <>
            <span className="sa-updated">Checked {timeAgo(data.generatedAt)}</span>
            <label className="sa-switch" style={{ marginRight: 4 }}>
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              <span className="track" />
              <span className="sa-switch-label">
                Auto-refresh
                <small>Every 30 seconds</small>
              </span>
            </label>
            <button className="btn btn-sm" onClick={() => load()} disabled={loading}>
              <Icon name="refresh" size={14} /> Refresh
            </button>
          </>
        }
      />

      {error ? <div className="form-error">{error}</div> : null}

      <div className="stat-grid">
        <StatCard
          icon="database"
          label="Database"
          value={h.database.ok ? "Healthy" : "Unavailable"}
          tone={h.database.ok ? "ok" : "warn"}
          sub={h.database.ok ? `${h.database.latencyMs} ms round-trip` : h.database.error || "Connection failed"}
        />
        <StatCard
          icon="server"
          label="Uptime"
          value={uptime(h.uptimeSeconds)}
          sub={`${h.environment} · Node ${h.nodeVersion}`}
        />
        <StatCard
          icon="activity"
          label="Node memory (RSS)"
          value={`${h.memory.rssMb} MB`}
          sub={`${h.memory.heapUsedMb} MB heap used of ${h.memory.heapTotalMb} MB`}
        />
        <StatCard
          icon="database"
          label="Storage used"
          value={bytes(data.storage.databaseBytes)}
          accent
          sub={`${fmtNumber(data.storage.tables.length)} largest tables listed`}
        />
      </div>

      <div className="sa-health-grid">
        <div className={"card sa-health " + (h.database.ok ? "ok" : "warn")}>
          <span className="ico" aria-hidden="true">
            <Icon name={h.database.ok ? "checkCircle" : "warning"} size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>Database connection</strong>
            <span>{h.database.ok ? "Queries are responding normally." : h.database.error || "No connection."}</span>
            <div className="sa-meter">
              <div
                className={"sa-meter-fill" + (h.database.ok ? "" : " warn")}
                style={{ width: h.database.ok ? "100%" : "22%" }}
              />
            </div>
            <div className="sa-health-meta">
              <span>Latency</span>
              <span>{h.database.latencyMs} ms</span>
            </div>
          </div>
        </div>

        <div className="card sa-health">
          <span className="ico" aria-hidden="true">
            <Icon name="activity" size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>Process memory</strong>
            <span>
              {h.memory.rssMb} MB RSS of {h.memory.systemTotalMb} MB host memory ({memPct}%).
            </span>
            <div className="sa-meter">
              <div className={"sa-meter-fill" + (memPct > 85 ? " warn" : "")} style={{ width: `${Math.max(2, memPct)}%` }} />
            </div>
            <div className="sa-health-meta">
              <span>Heap {h.memory.heapUsedMb} MB</span>
              <span>Free {bytes(h.memory.systemFreeMb * 1_048_576)}</span>
            </div>
          </div>
        </div>

        <div className="card sa-health">
          <span className="ico" aria-hidden="true">
            <Icon name="users" size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>Active sessions</strong>
            <span>
              {fmtNumber(data.counts.tenantSessions)} school sessions ·{" "}
              {fmtNumber(data.counts.platformSessions)} platform sessions.
            </span>
            <div className="sa-meter">
              <div
                className="sa-meter-fill"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(
                      2,
                      (data.counts.tenantSessions /
                        Math.max(1, data.counts.tenantSessions + data.counts.platformSessions)) *
                        100
                    )
                  )}%`,
                }}
              />
            </div>
            <div className="sa-health-meta">
              <span>Recovery links active</span>
              <span>{fmtNumber(data.counts.recoveryTokens)}</span>
            </div>
          </div>
        </div>

        <div className="card sa-health">
          <span className="ico" aria-hidden="true">
            <Icon name="globe" size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>Host</strong>
            <span>{h.platform}</span>
            <div className="sa-health-meta" style={{ marginTop: 10 }}>
              <span>Node {h.nodeVersion}</span>
              <span>{h.environment}</span>
            </div>
            <div className="sa-health-meta">
              <span>Uptime</span>
              <span>{uptime(h.uptimeSeconds)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <SectionCard title="Storage by table" icon="database">
          {data.storage.tables.length === 0 ? (
            <p className="muted">No table statistics are available.</p>
          ) : (
            <div className="sa-bars">
              {data.storage.tables.map((t) => (
                <div key={t.name} className="sa-bar-row">
                  <div className="sa-bar-label">
                    <strong className="sa-mono">{t.name}</strong>
                    <span>{fmtNumber(t.rows)} rows</span>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${Math.max(2, (t.bytes / maxTableBytes) * 100)}%` }}
                    />
                  </div>
                  <span className="sa-bar-pct">{bytes(t.bytes)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="sa-note">
            Database total: <strong>{bytes(data.storage.databaseBytes)}</strong>. Sizes come from PostgreSQL catalog
            statistics and update as the database writes.
          </p>
        </SectionCard>

        <SectionCard title="Record counts" icon="layers">
          <div className="sa-detail-grid">
            {(
              [
                ["Schools", data.counts.schools],
                ["Users", data.counts.users],
                ["Teachers", data.counts.teachers],
                ["Lesson plans", data.counts.plans],
                ["Lessons", data.counts.lessons],
                ["Subjects", data.counts.subjects],
                ["Assignments", data.counts.assignments],
                ["Subscriptions", data.counts.subscriptions],
                ["Payments", data.counts.payments],
                ["Announcements", data.counts.announcements],
                ["Audit entries", data.counts.auditLogs],
                ["Platform sessions", data.counts.platformSessions],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="sa-info">
                <span>{label}</span>
                <strong>{fmtNumber(value)}</strong>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="sa-mini-grid">
        <div className="card sa-mini">
          <Icon name="activity" size={16} />
          <div>
            <strong>{fmtNumber(data.last24h.logins)}</strong>
            <span>school logins · 24h</span>
          </div>
        </div>
        <div className="card sa-mini">
          <Icon name="warning" size={16} />
          <div>
            <strong>{fmtNumber(data.last24h.failedLogins)}</strong>
            <span>failed logins · 24h</span>
          </div>
        </div>
        <div className="card sa-mini">
          <Icon name="userPlus" size={16} />
          <div>
            <strong>{fmtNumber(data.last24h.registrations)}</strong>
            <span>new schools · 24h</span>
          </div>
        </div>
        <div className="card sa-mini">
          <Icon name="fileText" size={16} />
          <div>
            <strong>{fmtNumber(data.last24h.plansCreated)}</strong>
            <span>lesson plans · 24h</span>
          </div>
        </div>
      </div>

      <SectionCard title="Recent errors and security events" icon="warning">
        {data.errors.length === 0 ? (
          <p className="muted">No failed or blocked events have been recorded.</p>
        ) : (
          <div className="sa-log-list">
            {data.errors.map((e) => (
              <div key={e.id} className="sa-log-row">
                <span
                  className="sa-log-ico"
                  style={{ background: "var(--color-warning-soft)", color: "var(--color-warning)" }}
                >
                  <Icon name="warning" size={15} />
                </span>
                <div className="sa-log-body">
                  <strong>{e.summary || e.action}</strong>
                  <div className="meta">
                    <code>{e.action}</code>
                    {e.actorName || e.actorEmail ? <span>{e.actorName || e.actorEmail}</span> : null}
                    {e.ip ? <span>· {e.ip}</span> : null}
                  </div>
                </div>
                <div className="sa-log-time" title={fmtDateTime(e.createdAt)}>
                  {timeAgo(e.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <p className="sa-note">Last full check {fmtDateTime(data.generatedAt)}. Server secrets are never sent to the browser.</p>
    </div>
  );
}
