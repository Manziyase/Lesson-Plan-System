import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { auditFromRequest } from "@/lib/audit";
import {
  badRequest,
  clean,
  included,
  parseDate,
  readBody,
  toInt,
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_STATUSES,
} from "@/lib/platform-utils";

export const dynamic = "force-dynamic";

function announcementJson(a: {
  id: string;
  title: string;
  message: string;
  audience: string;
  status: string;
  publishAt: Date | null;
  expiresAt: Date | null;
  createdById: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  schools: { schoolId: string; school: { id: string; name: string; code: string } }[];
}) {
  return {
    id: a.id,
    title: a.title,
    message: a.message,
    audience: a.audience,
    status: a.status,
    publishAt: a.publishAt,
    expiresAt: a.expiresAt,
    createdById: a.createdById,
    createdByName: a.createdByName,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    schools: a.schools.map((s) => s.school),
  };
}

export async function GET(req: Request) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();

  const url = new URL(req.url);
  const q = clean(url.searchParams.get("q"), 120);
  const status = url.searchParams.get("status") ?? "";
  const audience = url.searchParams.get("audience") ?? "";
  const page = toInt(url.searchParams.get("page"), 1, 1, 10_000);
  const pageSize = toInt(url.searchParams.get("pageSize"), 20, 1, 100);

  const where: Prisma.AnnouncementWhereInput = {};
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { message: { contains: q, mode: "insensitive" } },
    ];
  }
  if (included(ANNOUNCEMENT_STATUSES, status)) where.status = status;
  if (included(ANNOUNCEMENT_AUDIENCES, audience)) where.audience = audience;

  const [total, rows, statusRows, schools] = await Promise.all([
    prisma.announcement.count({ where }),
    prisma.announcement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        schools: {
          include: { school: { select: { id: true, name: true, code: true } } },
          orderBy: { school: { name: "asc" } },
        },
      },
    }),
    prisma.announcement.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.school.findMany({
      select: { id: true, name: true, code: true, status: true },
      orderBy: { name: "asc" },
      take: 1000,
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const r of statusRows) counts[r.status] = r._count._all;

  return Response.json(
    {
      announcements: rows.map(announcementJson),
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

export async function POST(req: Request) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();

  const body = await readBody(req);
  const title = clean(body.title, 140);
  const message = clean(body.message, 8000);
  const audience = clean(body.audience, 20) || "all";
  const status = clean(body.status, 20) || "draft";

  if (!title) return badRequest("An announcement title is required.");
  if (!message) return badRequest("An announcement message is required.");
  if (!included(ANNOUNCEMENT_AUDIENCES, audience)) return badRequest("Invalid audience.");
  if (!included(ANNOUNCEMENT_STATUSES, status)) return badRequest("Invalid announcement status.");

  let schoolIds: string[] = [];
  if (audience === "schools") {
    schoolIds = Array.from(
      new Set(
        (Array.isArray(body.schoolIds) ? body.schoolIds : [])
          .map((v) => clean(v, 80))
          .filter(Boolean)
          .slice(0, 500)
      )
    );
    if (!schoolIds.length) return badRequest("Choose at least one school for this audience.");
    const found = await prisma.school.count({ where: { id: { in: schoolIds } } });
    if (found !== schoolIds.length) return badRequest("One or more selected schools no longer exist.");
  }

  const publishAt = parseDate(body.publishAt) ?? (status === "published" ? new Date() : null);
  const expiresAt = parseDate(body.expiresAt);

  const announcement = await prisma.announcement.create({
    data: {
      id: "ann_" + crypto.randomUUID().slice(0, 14),
      title,
      message,
      audience,
      status,
      publishAt,
      expiresAt,
      createdById: admin.id,
      createdByName: admin.name,
      schools: {
        create: schoolIds.map((schoolId) => ({ schoolId })),
      },
    },
    include: {
      schools: {
        include: { school: { select: { id: true, name: true, code: true } } },
        orderBy: { school: { name: "asc" } },
      },
    },
  });

  await auditFromRequest(req, admin, {
    action: status === "published" ? "announcement.publish" : "announcement.create",
    targetType: "announcement",
    targetId: announcement.id,
    summary: `${status === "published" ? "Published" : "Created"} announcement "${title}" for ${audience}`,
    metadata: { audience, status, schools: schoolIds.length, expiresAt: expiresAt?.toISOString() ?? null },
  });

  return Response.json({ announcement: announcementJson(announcement) }, { status: 201 });
}
