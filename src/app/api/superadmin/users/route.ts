import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { clean, included, toInt, USER_STATUSES } from "@/lib/platform-utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();

  const url = new URL(req.url);
  const q = clean(url.searchParams.get("q"), 120);
  const schoolId = clean(url.searchParams.get("schoolId"), 80);
  const role = url.searchParams.get("role") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const page = toInt(url.searchParams.get("page"), 1, 1, 10_000);
  const pageSize = toInt(url.searchParams.get("pageSize"), 25, 1, 100);
  const sort = url.searchParams.get("sort") ?? "newest";

  const where: Prisma.UserWhereInput = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { school: { name: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (schoolId) where.schoolId = schoolId;
  if (role === "admin" || role === "teacher") where.role = role;
  if (included(USER_STATUSES, status)) where.status = status;

  const orderBy: Prisma.UserOrderByWithRelationInput =
    sort === "name" ? { name: "asc" } : sort === "oldest" ? { createdAt: "asc" } : { createdAt: "desc" };

  const [total, rows, statusRows, schools] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        statusReason: true,
        disabledAt: true,
        lastLoginAt: true,
        mustChangePassword: true,
        createdAt: true,
        schoolId: true,
        school: { select: { id: true, name: true, code: true, status: true } },
      },
    }),
    prisma.user.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.school.findMany({
      select: { id: true, name: true, code: true, status: true },
      orderBy: { name: "asc" },
      take: 1000,
    }),
  ]);

  const counts: Record<string, number> = { active: 0, disabled: 0 };
  for (const r of statusRows) counts[r.status] = r._count._all;

  return Response.json(
    {
      users: rows,
      schools,
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      counts,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
