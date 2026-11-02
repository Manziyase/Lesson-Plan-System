import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { auditFromRequest } from "@/lib/audit";
import {
  badRequest,
  clean,
  included,
  notFound,
  parseDate,
  readBody,
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_STATUSES,
} from "@/lib/platform-utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const INCLUDE = {
  schools: {
    include: { school: { select: { id: true, name: true, code: true } } },
    orderBy: { school: { name: "asc" } },
  },
} as const;

export async function PATCH(req: Request, { params }: Params) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();
  const { id } = await params;

  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) return notFound("Announcement not found.");

  const body = await readBody(req);
  const data: Prisma.AnnouncementUncheckedUpdateInput = {};
  if (body.title !== undefined) {
    const title = clean(body.title, 140);
    if (!title) return badRequest("An announcement title is required.");
    data.title = title;
  }
  if (body.message !== undefined) {
    const message = clean(body.message, 8000);
    if (!message) return badRequest("An announcement message is required.");
    data.message = message;
  }
  if (body.audience !== undefined) {
    if (!included(ANNOUNCEMENT_AUDIENCES, body.audience)) return badRequest("Invalid audience.");
    data.audience = body.audience;
  }
  if (body.status !== undefined) {
    if (!included(ANNOUNCEMENT_STATUSES, body.status)) return badRequest("Invalid announcement status.");
    data.status = body.status;
    if (body.status === "published" && !existing.publishAt && body.publishAt === undefined) {
      data.publishAt = new Date();
    }
  }
  if (body.publishAt !== undefined) data.publishAt = parseDate(body.publishAt);
  if (body.expiresAt !== undefined) data.expiresAt = parseDate(body.expiresAt);

  if (!Object.keys(data).length && !Array.isArray(body.schoolIds)) {
    return badRequest("No changes were provided.");
  }

  const audience = (data.audience as string | undefined) ?? existing.audience;
  let schoolIds: string[] | null = null;
  if (body.schoolIds !== undefined || audience !== "schools") {
    schoolIds = Array.isArray(body.schoolIds)
      ? Array.from(
          new Set(
            body.schoolIds
              .map((v) => clean(v, 80))
              .filter(Boolean)
              .slice(0, 500)
          )
        )
      : [];
    if (audience === "schools") {
      if (!schoolIds.length) return badRequest("Choose at least one school for this audience.");
      const found = await prisma.school.count({ where: { id: { in: schoolIds } } });
      if (found !== schoolIds.length) return badRequest("One or more selected schools no longer exist.");
    } else {
      schoolIds = [];
    }
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length) {
      await tx.announcement.update({ where: { id }, data });
    }
    if (schoolIds) {
      await tx.announcementSchool.deleteMany({ where: { announcementId: id } });
      if (schoolIds.length) {
        await tx.announcementSchool.createMany({
          data: schoolIds.map((schoolId) => ({ announcementId: id, schoolId })),
        });
      }
    }
  });

  const announcement = await prisma.announcement.findUniqueOrThrow({ where: { id }, include: INCLUDE });

  await auditFromRequest(req, admin, {
    action: "announcement.update",
    targetType: "announcement",
    targetId: id,
    summary: `Updated announcement "${announcement.title}" (${announcement.status})`,
    metadata: { changed: Object.keys(data), audience: announcement.audience, schools: announcement.schools.length },
  });

  return Response.json({ announcement });
}

export async function DELETE(req: Request, { params }: Params) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();
  const { id } = await params;

  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) return notFound("Announcement not found.");

  await prisma.announcement.delete({ where: { id } });

  await auditFromRequest(req, admin, {
    action: "announcement.delete",
    targetType: "announcement",
    targetId: id,
    summary: `Deleted announcement "${existing.title}"`,
    metadata: { audience: existing.audience, status: existing.status },
  });

  return Response.json({ ok: true });
}
