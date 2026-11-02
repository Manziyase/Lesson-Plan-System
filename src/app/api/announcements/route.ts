import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getSessionUser, unauthorized } from "@/lib/session";
import { getPlatformSettings } from "@/lib/platform";

export const dynamic = "force-dynamic";

/** Announcements visible to the signed-in school user (tenant scoped). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const settings = await getPlatformSettings();
  if (!settings.features.announcements) return Response.json({ announcements: [] });

  const now = new Date();
  const where: Prisma.AnnouncementWhereInput = {
    status: "published",
    AND: [
      { OR: [{ publishAt: null }, { publishAt: { lte: now } }] },
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    ],
    OR: [
      { audience: "all" },
      { audience: user.role === "admin" ? "admins" : "teachers" },
      { audience: "schools", schools: { some: { schoolId: user.schoolId } } },
    ],
  };

  const announcements = await prisma.announcement.findMany({
    where,
    orderBy: [{ publishAt: "desc" }, { createdAt: "desc" }],
    take: 20,
    select: {
      id: true,
      title: true,
      message: true,
      audience: true,
      publishAt: true,
      createdAt: true,
      createdByName: true,
    },
  });

  return Response.json({ announcements }, { headers: { "Cache-Control": "no-store" } });
}
