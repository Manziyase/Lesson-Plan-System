import os from "os";
import { prisma } from "@/lib/db";
import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";

export const dynamic = "force-dynamic";

type DbSize = { size: bigint };
type TableSize = { relname: string; bytes: bigint; rows: bigint };

export async function GET() {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();

  const now = new Date();
  const since24 = new Date(now.getTime() - 24 * 3_600_000);
  const started = Date.now();

  let dbOk = false;
  let dbError = "";
  let dbLatencyMs = 0;
  let dbBytes = 0;
  let tables: { name: string; bytes: number; rows: number }[] = [];

  try {
    const [ping, size, tableRows] = await Promise.all([
      prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`,
      prisma.$queryRaw<DbSize[]>`SELECT pg_database_size(current_database()) AS size`,
      prisma.$queryRaw<TableSize[]>`
        SELECT relname, pg_total_relation_size(relid) AS bytes, n_live_tup AS rows
        FROM pg_catalog.pg_stat_user_tables
        ORDER BY pg_total_relation_size(relid) DESC
        LIMIT 14`,
    ]);
    dbLatencyMs = Date.now() - started;
    dbOk = ping[0]?.ok === 1;
    dbBytes = Number(size[0]?.size ?? 0);
    tables = tableRows.map((t) => ({ name: t.relname, bytes: Number(t.bytes), rows: Number(t.rows) }));
  } catch (err) {
    dbError = err instanceof Error ? err.message : "Database check failed";
  }

  const [
    schools,
    users,
    teachers,
    plans,
    lessons,
    subjects,
    assignments,
    subscriptions,
    payments,
    announcements,
    auditLogs,
    tenantSessions,
    platformSessions,
    recoveryTokens,
    logins24,
    failedLogins24,
    registrations24,
    plans24,
    errors,
  ] = await Promise.all([
    prisma.school.count(),
    prisma.user.count(),
    prisma.user.count({ where: { role: "teacher" } }),
    prisma.plan.count(),
    prisma.lesson.count(),
    prisma.subject.count(),
    prisma.teachingAssignment.count(),
    prisma.schoolSubscription.count(),
    prisma.paymentRecord.count(),
    prisma.announcement.count(),
    prisma.auditLog.count(),
    prisma.session.count({ where: { expiresAt: { gt: now } } }),
    prisma.platformSession.count({ where: { expiresAt: { gt: now } } }),
    prisma.recoveryToken.count({ where: { usedAt: null, expiresAt: { gt: now } } }),
    prisma.auditLog.count({ where: { action: "auth.login", createdAt: { gte: since24 } } }),
    prisma.auditLog.count({ where: { action: "auth.login_failed", createdAt: { gte: since24 } } }),
    prisma.auditLog.count({ where: { action: "school.registered", createdAt: { gte: since24 } } }),
    prisma.plan.count({ where: { createdAt: { gte: since24 } } }),
    prisma.auditLog.findMany({
      where: {
        OR: [
          { action: { contains: "failed", mode: "insensitive" } },
          { action: { contains: "error", mode: "insensitive" } },
          { action: { contains: "blocked", mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        action: true,
        actorName: true,
        actorEmail: true,
        summary: true,
        ip: true,
        createdAt: true,
      },
    }),
  ]);

  const mem = process.memoryUsage();

  return Response.json(
    {
      generatedAt: new Date().toISOString(),
      health: {
        ok: dbOk,
        database: { ok: dbOk, latencyMs: dbLatencyMs, error: dbError },
        uptimeSeconds: Math.round(process.uptime()),
        nodeVersion: process.version,
        platform: `${os.type()} ${os.release()}`,
        memory: {
          rssMb: Math.round(mem.rss / 1_048_576),
          heapUsedMb: Math.round(mem.heapUsed / 1_048_576),
          heapTotalMb: Math.round(mem.heapTotal / 1_048_576),
          systemTotalMb: Math.round(os.totalmem() / 1_048_576),
          systemFreeMb: Math.round(os.freemem() / 1_048_576),
        },
        environment: process.env.NODE_ENV ?? "development",
      },
      storage: {
        databaseBytes: dbBytes,
        tables,
      },
      counts: {
        schools,
        users,
        teachers,
        plans,
        lessons,
        subjects,
        assignments,
        subscriptions,
        payments,
        announcements,
        auditLogs,
        tenantSessions,
        platformSessions,
        recoveryTokens,
      },
      last24h: {
        logins: logins24,
        failedLogins: failedLogins24,
        registrations: registrations24,
        plansCreated: plans24,
      },
      errors,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
