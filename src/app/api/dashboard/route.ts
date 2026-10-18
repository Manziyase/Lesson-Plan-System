import { prisma } from "@/lib/db";
import { getSessionUser, publicUser, unauthorized } from "@/lib/session";
import { slugify, todayKigali, str } from "@/lib/util";
import { planSummary } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const url = new URL(req.url);
  const yearId = str(url.searchParams.get("year")) || user.activeYearId || "";
  const school = await prisma.school.findUnique({ where: { id: user.schoolId } });
  const isAdmin = user.role === "admin";

  const plans = await prisma.plan.findMany({
    where: { schoolId: user.schoolId, ...(isAdmin ? {} : { teacherId: user.id }) },
    include: { rows: true },
    orderBy: { updatedAt: "desc" },
  });
  const inYear = yearId ? plans.filter((p) => p.academicYearId === yearId) : plans;
  const lessons = await prisma.lesson.findMany({
    where: {
      schoolId: user.schoolId,
      // Admin sees school-wide stats over approved plans; a teacher sees
      // their own archive, including plans still pending approval.
      ...(isAdmin ? { status: "published" } : { teacherId: user.id }),
      ...(yearId ? { academicYearId: yearId } : {}),
    },
  });

  const today = todayKigali();
  const byDate = new Map<string, number>();
  for (const p of inYear) byDate.set(p.date, (byDate.get(p.date) || 0) + 1);

  const perClass: Record<string, number> = {};
  const perArea: Record<string, number> = {};
  const perTerm: Record<string, number> = { "1": 0, "2": 0, "3": 0 };
  for (const l of lessons) {
    if (l.className) perClass[l.className] = (perClass[l.className] || 0) + 1;
    if (l.learningArea) perArea[l.learningArea] = (perArea[l.learningArea] || 0) + 1;
    if (l.term >= 1 && l.term <= 3) perTerm[String(l.term)] += 1;
  }

  return Response.json({
    today,
    school: school ? { name: school.name, district: school.district } : null,
    me: publicUser(user),
    stats: {
      plans: inYear.length,
      lessons: lessons.length,
      units: new Set(lessons.map((l) => slugify(l.unit)).filter(Boolean)).size,
      teachers: isAdmin ? new Set(plans.map((p) => p.teacherId)).size : 1,
      upcoming: inYear.filter((p) => p.date >= today).length,
      // Approval status counts (admin: school-wide, teacher: own plans).
      pending: inYear.filter((p) => p.status === "pending").length,
      published: inYear.filter((p) => p.status === "published").length,
    },
    recent: plans.slice(0, 6).map(planSummary),
    perClass,
    perArea,
    perTerm,
    activity: Array.from(byDate.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-30)
      .map(([date, count]) => ({ date, count })),
  });
}
