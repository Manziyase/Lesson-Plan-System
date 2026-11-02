import { prisma } from "@/lib/db";
import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { getPlatformSettings, ensureDefaultPlans } from "@/lib/platform";

export const dynamic = "force-dynamic";

type RawPoint = { month: Date; count: number };
type RawDay = { day: Date; count: number };

function monthSeries(rows: RawPoint[], months = 12) {
  const now = new Date();
  const series = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - i), 1));
    return {
      key: d.toISOString().slice(0, 7),
      label: `${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${String(
        d.getUTCFullYear()
      ).slice(2)}`,
      count: 0,
    };
  });
  const byKey = new Map(series.map((s) => [s.key, s]));
  for (const row of rows) {
    const key = new Date(row.month).toISOString().slice(0, 7);
    const point = byKey.get(key);
    if (point) point.count = Number(row.count);
  }
  return series;
}

function daySeries(rows: RawDay[], days = 14) {
  const now = new Date();
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1 - i))
    );
    return {
      key: d.toISOString().slice(0, 10),
      label: `${d.getUTCDate()} ${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}`,
      count: 0,
    };
  });
  const byKey = new Map(series.map((s) => [s.key, s]));
  for (const row of rows) {
    const key = new Date(row.day).toISOString().slice(0, 10);
    const point = byKey.get(key);
    if (point) point.count = Number(row.count);
  }
  return series;
}

export async function GET() {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();

  await ensureDefaultPlans().catch(() => {});

  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 86_400_000);
  const since24 = new Date(now.getTime() - 24 * 3_600_000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const trendStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const activityStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 13)
  );

  const [
    settings,
    schoolsTotal,
    schoolsActive,
    schoolsSuspended,
    schoolsDeactivated,
    teachers,
    schoolAdmins,
    usersTotal,
    plansTotal,
    plansThisMonth,
    lessonsTotal,
    newSchools30,
    newUsers30,
    subsByStatus,
    announcementsPublished,
    paidAll,
    paid30,
    recentLogs,
    recentSchools,
    schoolTrendRows,
    userTrendRows,
    planTrendRows,
    activityRows,
    planDistRows,
    loginEvents24,
    failedLogin24,
    activeTenantSessions,
  ] = await Promise.all([
    getPlatformSettings(),
    prisma.school.count(),
    prisma.school.count({ where: { status: "active" } }),
    prisma.school.count({ where: { status: "suspended" } }),
    prisma.school.count({ where: { status: "deactivated" } }),
    prisma.user.count({ where: { role: "teacher" } }),
    prisma.user.count({ where: { role: "admin" } }),
    prisma.user.count(),
    prisma.plan.count(),
    prisma.plan.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.lesson.count(),
    prisma.school.count({ where: { createdAt: { gte: since30 } } }),
    prisma.user.count({ where: { createdAt: { gte: since30 } } }),
    prisma.schoolSubscription.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.announcement.count({ where: { status: "published" } }),
    prisma.paymentRecord.aggregate({ where: { status: "paid" }, _sum: { amount: true } }),
    prisma.paymentRecord.aggregate({
      where: { status: "paid", paidAt: { gte: since30 } },
      _sum: { amount: true },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        action: true,
        actorType: true,
        actorName: true,
        actorEmail: true,
        summary: true,
        schoolId: true,
        createdAt: true,
      },
    }),
    prisma.school.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        name: true,
        code: true,
        district: true,
        ownership: true,
        status: true,
        createdAt: true,
        _count: { select: { users: true, plans: true } },
      },
    }),
    prisma.$queryRaw<RawPoint[]>`
      SELECT date_trunc('month', "createdAt") AS month, count(*)::int AS count
      FROM "School" WHERE "createdAt" >= ${trendStart}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<RawPoint[]>`
      SELECT date_trunc('month', "createdAt") AS month, count(*)::int AS count
      FROM "User" WHERE "createdAt" >= ${trendStart}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<RawPoint[]>`
      SELECT date_trunc('month', "createdAt") AS month, count(*)::int AS count
      FROM "Plan" WHERE "createdAt" >= ${trendStart}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<RawDay[]>`
      SELECT date_trunc('day', "createdAt") AS day, count(*)::int AS count
      FROM "AuditLog" WHERE "createdAt" >= ${activityStart}
      GROUP BY 1 ORDER BY 1`,
    prisma.schoolSubscription.groupBy({ by: ["planId"], _count: { _all: true } }),
    prisma.auditLog.count({ where: { action: "auth.login", createdAt: { gte: since24 } } }),
    prisma.auditLog.count({
      where: { action: "auth.login_failed", createdAt: { gte: since24 } },
    }),
    prisma.session.count({ where: { expiresAt: { gt: now } } }),
  ]);

  const statusMap: Record<string, number> = {};
  for (const row of subsByStatus) statusMap[row.status] = row._count._all;

  const planIds = planDistRows.map((r) => r.planId);
  const planRows = planIds.length
    ? await prisma.subscriptionPlan.findMany({
        where: { id: { in: planIds } },
        select: { id: true, name: true, code: true },
      })
    : [];
  const planName = new Map(planRows.map((p) => [p.id, p]));
  const planDistribution = planDistRows
    .map((r) => ({
      planId: r.planId,
      name: planName.get(r.planId)?.name ?? "Unknown",
      code: planName.get(r.planId)?.code ?? "",
      count: r._count._all,
    }))
    .sort((a, b) => b.count - a.count);

  const schoolTrend = monthSeries(schoolTrendRows);
  const userTrend = monthSeries(userTrendRows);
  const planTrend = monthSeries(planTrendRows);
  const activityTrend = daySeries(activityRows);

  const prevMonth = <T extends { count: number }>(series: T[]) => series[series.length - 2]?.count ?? 0;
  const lastMonth = <T extends { count: number }>(series: T[]) => series[series.length - 1]?.count ?? 0;
  const growth = (series: { count: number }[]) => {
    const prev = prevMonth(series);
    const last = lastMonth(series);
    if (prev === 0) return last > 0 ? 100 : 0;
    return Math.round(((last - prev) / prev) * 100);
  };

  return Response.json(
    {
      generatedAt: new Date().toISOString(),
      platform: { name: settings.name, shortName: settings.shortName },
      stats: {
        schoolsTotal,
        schoolsActive,
        schoolsSuspended,
        schoolsDeactivated,
        teachers,
        schoolAdmins,
        usersTotal,
        plansTotal,
        plansThisMonth,
        lessonsTotal,
        newSchools30,
        newUsers30,
        announcementsPublished,
        activeTenantSessions,
        loginEvents24,
        failedLogin24,
      },
      subscriptions: {
        byStatus: {
          trial: statusMap.trial ?? 0,
          active: statusMap.active ?? 0,
          expired: statusMap.expired ?? 0,
          cancelled: statusMap.cancelled ?? 0,
          suspended: statusMap.suspended ?? 0,
        },
        distribution: planDistribution,
        revenue: {
          currency: settings.subscriptions.currency || "RWF",
          totalPaid: paidAll._sum.amount ?? 0,
          paidLast30Days: paid30._sum.amount ?? 0,
        },
      },
      trends: {
        schools: { series: schoolTrend, growth: growth(schoolTrend) },
        users: { series: userTrend, growth: growth(userTrend) },
        plans: { series: planTrend, growth: growth(planTrend) },
        activity: activityTrend,
      },
      recent: {
        logs: recentLogs,
        schools: recentSchools,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
