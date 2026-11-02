import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { clean, parseDate, safeJson, toInt } from "@/lib/platform-utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();

  const url = new URL(req.url);
  const q = clean(url.searchParams.get("q"), 120);
  const action = clean(url.searchParams.get("action"), 80);
  const actorType = clean(url.searchParams.get("actorType"), 30);
  const schoolId = clean(url.searchParams.get("schoolId"), 80);
  const page = toInt(url.searchParams.get("page"), 1, 1, 100_000);
  const pageSize = toInt(url.searchParams.get("pageSize"), 40, 1, 100);
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));

  const where: Prisma.AuditLogWhereInput = {};
  if (q) {
    where.OR = [
      { summary: { contains: q, mode: "insensitive" } },
      { actorName: { contains: q, mode: "insensitive" } },
      { actorEmail: { contains: q, mode: "insensitive" } },
      { action: { contains: q, mode: "insensitive" } },
      { targetId: { contains: q, mode: "insensitive" } },
    ];
  }
  if (action) where.action = action;
  if (actorType) where.actorType = actorType;
  if (schoolId) where.schoolId = schoolId;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  const [total, rows, actionRows, actorRows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    prisma.auditLog.groupBy({ by: ["actorType"], _count: { _all: true } }),
  ]);

  const schoolIds = Array.from(new Set(rows.map((r) => r.schoolId).filter(Boolean)));
  const schools = schoolIds.length
    ? await prisma.school.findMany({
        where: { id: { in: schoolIds } },
        select: { id: true, name: true },
      })
    : [];
  const schoolName = new Map(schools.map((s) => [s.id, s.name]));

  return Response.json(
    {
      logs: rows.map((r) => ({
        ...r,
        metadata: safeJson<Record<string, unknown>>(r.metadata, {}),
        schoolName: r.schoolId ? schoolName.get(r.schoolId) ?? "" : "",
      })),
      actions: actionRows.map((r) => r.action),
      actorTypes: actorRows.map((r) => ({ type: r.actorType, count: r._count._all })),
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
