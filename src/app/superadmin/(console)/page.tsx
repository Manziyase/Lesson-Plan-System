"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { useToast, Spinner } from "@/components/ui";
import { saApi, fmtNumber, fmtMoney, timeAgo, fmtDate } from "@/lib/superadmin-client";
import { TrendChart, BarChart, Donut, type Point } from "@/components/superadmin/charts";
import {
  SaPageHeader,
  StatCard,
  StatusChip,
  ChartCard,
  Delta,
  SectionCard,
} from "@/components/superadmin/ui";

type Overview = {
  generatedAt: string;
  platform: { name: string; shortName: string };
  stats: {
    schoolsTotal: number;
    schoolsActive: number;
    schoolsSuspended: number;
    schoolsDeactivated: number;
    teachers: number;
    schoolAdmins: number;
    usersTotal: number;
    plansTotal: number;
    plansThisMonth: number;
    lessonsTotal: number;
    newSchools30: number;
    newUsers30: number;
    announcementsPublished: number;
    activeTenantSessions: number;
    loginEvents24: number;
    failedLogin24: number;
  };
  subscriptions: {
    byStatus: Record<string, number>;
    distribution: { planId: string; name: string; code: string; count: number }[];
    revenue: { currency: string; totalPaid: number; paidLast30Days: number };
  };
  trends: {
    schools: { series: Point[]; growth: number };
    users: { series: Point[]; growth: number };
    plans: { series: Point[]; growth: number };
    activity: Point[];
  };
  recent: {
    logs: {
      id: string;
      action: string;
      actorType: string;
      actorName: string;
      actorEmail: string;
      summary: string;
      schoolId: string;
      createdAt: string;
    }[];
    schools: {
      id: string;
      name: string;
      code: string;
      district: string;
      ownership: string;
      status: string;
      createdAt: string;
      _count: { users: number; plans: number };
    }[];
  };
};

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const toast = useToast();

  const load = useCallback(async (announce = false) => {
    setError("");
    try {
      const res = await saApi<Overview>("/api/superadmin/overview");
      setData(res);
      if (announce) toast("Dashboard refreshed.", "ok");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load platform statistics.");
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data && !error) return <Spinner />;

  if (error && !data) {
    return (
      <div className="stack">
        <SaPageHeader title="Platform Overview" sub="Live statistics from the LessonHub database." />
        <div className="form-error">{error}</div>
        <button className="btn btn-primary" onClick={() => load()}>
          <Icon name="refresh" size={15} /> Try again
        </button>
      </div>
    );
  }
  if (!data) return <Spinner />;

  const s = data.stats;
  const sub = data.subscriptions;
  const donut = [
    { label: "Active", count: sub.byStatus.active ?? 0, color: "#16A34A" },
    { label: "Trial", count: sub.byStatus.trial ?? 0, color: "#C9A227" },
    { label: "Expired", count: sub.byStatus.expired ?? 0, color: "#97A0B8" },
    { label: "Suspended", count: sub.byStatus.suspended ?? 0, color: "#D97706" },
    { label: "Cancelled", count: sub.byStatus.cancelled ?? 0, color: "#DC2626" },
  ];
  const planTotal = sub.distribution.reduce((sum, p) => sum + p.count, 0);

  return (
    <div className="stack">
      <SaPageHeader
        title="Platform Overview"
        sub={`Live operational picture for ${data.platform.name}. Everything below is read directly from the database.`}
        actions={
          <>
            <span className="sa-updated">Updated {fmtDate(data.generatedAt)} · {new Date(data.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
            <button className="btn btn-sm" onClick={() => load(true)}>
              <Icon name="refresh" size={14} /> Refresh
            </button>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard
          icon="school"
          label="Registered schools"
          value={s.schoolsTotal}
          sub={`${s.newSchools30} joined in the last 30 days`}
        />
        <StatCard
          icon="checkCircle"
          label="Active schools"
          value={s.schoolsActive}
          tone="ok"
          sub={`${s.schoolsSuspended} suspended · ${s.schoolsDeactivated} deactivated`}
        />
        <StatCard icon="graduation" label="Teachers" value={s.teachers} sub={`${s.schoolAdmins} school administrators`} />
        <StatCard icon="users" label="Platform users" value={s.usersTotal} sub={`${s.newUsers30} new in 30 days`} />
        <StatCard icon="fileText" label="Lesson plans" value={s.plansTotal} sub={`${s.plansThisMonth} created this month`} />
        <StatCard icon="book" label="Lessons" value={s.lessonsTotal} sub="Searchable lesson records" />
        <StatCard
          icon="creditCard"
          label="Paid subscriptions"
          value={(sub.byStatus.active ?? 0) + (sub.byStatus.trial ?? 0)}
          sub={`${sub.byStatus.trial ?? 0} trials · ${sub.byStatus.expired ?? 0} expired`}
        />
        <StatCard
          icon="chart"
          label="Recorded revenue"
          accent
          value={fmtMoney(sub.revenue.totalPaid, sub.revenue.currency)}
          sub={`${fmtMoney(sub.revenue.paidLast30Days, sub.revenue.currency)} in last 30 days`}
        />
      </div>

      <div className="sa-chart-grid">
        <ChartCard
          title="School registration trend"
          sub="New school workspaces over the last 12 months"
          action={<Delta value={data.trends.schools.growth} />}
        >
          <TrendChart data={data.trends.schools.series} color="var(--color-royal-600)" suffix="schools" />
        </ChartCard>

        <ChartCard title="Platform activity" sub="Audited events over the last 14 days">
          <BarChart data={data.trends.activity} color="var(--color-gold)" suffix="events" />
        </ChartCard>

        <ChartCard
          title="User growth"
          sub="New school accounts (admins + teachers) per month"
          action={<Delta value={data.trends.users.growth} />}
        >
          <TrendChart data={data.trends.users.series} color="var(--color-ok)" suffix="users" />
        </ChartCard>

        <ChartCard
          title="Lesson plan usage"
          sub="Plans created per month across all schools"
          action={<Delta value={data.trends.plans.growth} />}
        >
          <TrendChart data={data.trends.plans.series} color="var(--color-warning)" suffix="plans" />
        </ChartCard>
      </div>

      <div className="grid-2">
        <SectionCard title="Subscription status" icon="creditCard">
          <Donut data={donut} centerLabel="subscriptions" />
          <p className="sa-note">
            Revenue reflects only payments explicitly recorded as paid. No payment is simulated.
          </p>
        </SectionCard>

        <SectionCard title="Plan distribution" icon="layers" action={<Link className="btn btn-sm" href="/superadmin/subscriptions">Manage</Link>}>
          {sub.distribution.length === 0 ? (
            <p className="muted">No subscriptions have been assigned yet.</p>
          ) : (
            <div className="sa-bars">
              {sub.distribution.map((p) => (
                <div key={p.planId} className="sa-bar-row">
                  <div className="sa-bar-label">
                    <strong>{p.name}</strong>
                    <span>{p.count} {p.count === 1 ? "school" : "schools"}</span>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${planTotal ? Math.max(3, (p.count / planTotal) * 100) : 0}%` }}
                    />
                  </div>
                  <span className="sa-bar-pct">{planTotal ? Math.round((p.count / planTotal) * 100) : 0}%</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid-2">
        <SectionCard
          title="Newest schools"
          icon="school"
          action={<Link className="btn btn-sm" href="/superadmin/schools">View all</Link>}
        >
          {data.recent.schools.length === 0 ? (
            <p className="muted">No schools registered yet.</p>
          ) : (
            <div className="sa-recent-list">
              {data.recent.schools.map((school) => (
                <Link key={school.id} className="sa-recent-row" href={`/superadmin/schools?school=${school.id}`}>
                  <span className="sa-avatar">{school.name.slice(0, 2).toUpperCase()}</span>
                  <span className="sa-recent-main">
                    <strong>{school.name}</strong>
                    <span>
                      {[school.district, school.ownership].filter(Boolean).join(" · ") || "No location recorded"}
                    </span>
                  </span>
                  <span className="sa-recent-meta">
                    <StatusChip status={school.status} />
                    <span>{school._count.users} users · {school._count.plans} plans</span>
                  </span>
                  <Icon name="chevronsRight" size={15} />
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Recent platform activity"
          icon="activity"
          action={<Link className="btn btn-sm" href="/superadmin/logs">Audit log</Link>}
        >
          {data.recent.logs.length === 0 ? (
            <p className="muted">No activity recorded yet.</p>
          ) : (
            <div className="sa-recent-list">
              {data.recent.logs.map((log) => (
                <div key={log.id} className="sa-recent-row static">
                  <span className="sa-log-ico">
                    <Icon name={log.action.includes("auth") ? "shield" : log.action.startsWith("school") ? "school" : "activity"} size={15} />
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

      <div className="sa-mini-grid">
        <div className="card sa-mini">
          <Icon name="activity" size={16} />
          <div>
            <strong>{fmtNumber(s.loginEvents24)}</strong>
            <span>school logins · 24h</span>
          </div>
        </div>
        <div className="card sa-mini">
          <Icon name="shield" size={16} />
          <div>
            <strong>{fmtNumber(s.failedLogin24)}</strong>
            <span>failed logins · 24h</span>
          </div>
        </div>
        <div className="card sa-mini">
          <Icon name="users" size={16} />
          <div>
            <strong>{fmtNumber(s.activeTenantSessions)}</strong>
            <span>active school sessions</span>
          </div>
        </div>
        <div className="card sa-mini">
          <Icon name="megaphone" size={16} />
          <div>
            <strong>{fmtNumber(s.announcementsPublished)}</strong>
            <span>published announcements</span>
          </div>
        </div>
      </div>
    </div>
  );
}
