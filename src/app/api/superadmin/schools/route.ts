import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { clean, included, toInt, SCHOOL_STATUSES } from "@/lib/platform-utils";
import { OWNERSHIP_TYPES, SCHOOL_LEVELS } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();

  const url = new URL(req.url);
  const q = clean(url.searchParams.get("q"), 120);
  const status = url.searchParams.get("status") ?? "";
  const ownership = url.searchParams.get("ownership") ?? "";
  const level = url.searchParams.get("level") ?? "";
  const province = clean(url.searchParams.get("province"), 60);
  const sort = url.searchParams.get("sort") ?? "newest";
  const page = toInt(url.searchParams.get("page"), 1, 1, 10_000);
  const pageSize = toInt(url.searchParams.get("pageSize"), 20, 1, 100);

  const where: Prisma.SchoolWhereInput = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { district: { contains: q, mode: "insensitive" } },
      { sector: { contains: q, mode: "insensitive" } },
      { province: { contains: q, mode: "insensitive" } },
      { address: { contains: q, mode: "insensitive" } },
      { officialEmail: { contains: q, mode: "insensitive" } },
    ];
  }
  if (included(SCHOOL_STATUSES, status)) where.status = status;
  if (included(OWNERSHIP_TYPES, ownership)) where.ownership = ownership;
  if (included(SCHOOL_LEVELS, level)) where.level = level;
  if (province) where.province = { contains: province, mode: "insensitive" };

  const orderBy: Prisma.SchoolOrderByWithRelationInput =
    sort === "name" ? { name: "asc" } : sort === "oldest" ? { createdAt: "asc" } : { createdAt: "desc" };

  const [total, rows, statusRows] = await Promise.all([
    prisma.school.count({ where }),
    prisma.school.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { users: true, classes: true, plans: true } },
        users: { select: { role: true, status: true } },
        subscriptions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { plan: { select: { id: true, name: true, code: true } } },
        },
      },
    }),
    prisma.school.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const counts: Record<string, number> = { pending: 0, active: 0, suspended: 0, deactivated: 0 };
  for (const r of statusRows) counts[r.status] = r._count._all;

  return Response.json(
    {
      schools: rows.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        level: s.level,
        ownership: s.ownership,
        province: s.province,
        district: s.district,
        sector: s.sector,
        address: s.address,
        officialEmail: s.officialEmail,
        officialPhone: s.officialPhone,
        status: s.status,
        statusReason: s.statusReason,
        statusChangedAt: s.statusChangedAt,
        createdAt: s.createdAt,
        lastActiveAt: s.lastActiveAt,
        counts: {
          users: s._count.users,
          classes: s._count.classes,
          plans: s._count.plans,
          teachers: s.users.filter((u) => u.role === "teacher").length,
          admins: s.users.filter((u) => u.role === "admin").length,
          disabledUsers: s.users.filter((u) => u.status !== "active").length,
        },
        subscription: s.subscriptions[0]
          ? {
              id: s.subscriptions[0].id,
              status: s.subscriptions[0].status,
              billingCycle: s.subscriptions[0].billingCycle,
              startDate: s.subscriptions[0].startDate,
              renewsAt: s.subscriptions[0].renewsAt,
              endsAt: s.subscriptions[0].endsAt,
              plan: s.subscriptions[0].plan,
            }
          : null,
      })),
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      counts,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
