import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/session";
import { slugify } from "@/lib/util";

export const dynamic = "force-dynamic";

/* GET /api/lessons/units — distinct unit/topic list within the current
   filters; powers "browse by unit" (legacy parity). School-wide view shows
   admin-approved plans only; ?mine=1 includes your pending ones. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const q = new URL(req.url).searchParams;
  const mine = q.get("mine") === "1";
  const year = q.get("year") || "";
  const cls = q.get("class") || "";
  const classes = q.get("classes") || "";
  const area = q.get("area") || "";
  const teacher = q.get("teacher") || "";

  const where: Record<string, unknown> = { schoolId: user.schoolId };
  if (mine) {
    where.teacherId = user.id;
  } else {
    // School-wide unit browse: admin-approved plans only.
    where.status = "published";
  }
  if (year) where.academicYearId = year;
  if (!mine && teacher) where.teacherId = teacher;
  if (cls) where.classId = cls;
  if (classes) {
    const ids = classes.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length) where.classId = { in: ids };
  }
  if (area) where.learningAreaId = area;

  const list = await prisma.lesson.findMany({
    where: where as never,
    orderBy: [{ date: "desc" }],
    take: 4000,
  });

  const map = new Map<string, { unit: string; slug: string; count: number; areas: Set<string>; classes: Set<string>; teachers: Set<string>; lastTaught: string; subUnits: Map<string, { count: number; completed: number }> }>();
  for (const l of list) {
    const key = slugify(l.unit);
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, { unit: l.unit, slug: key, count: 0, areas: new Set(), classes: new Set(), teachers: new Set(), lastTaught: l.date, subUnits: new Map() });
    }
    const e = map.get(key)!;
    e.count += 1;
    const sub = l.subUnit || "(No sub-unit specified)";
    const progress = e.subUnits.get(sub) ?? { count: 0, completed: 0 };
    progress.count++;
    if ((l as unknown as { teachingStatus: string }).teachingStatus === "completed") progress.completed++;
    e.subUnits.set(sub, progress);
    e.areas.add(l.learningArea);
    e.classes.add(l.className);
    if (l.teacherName) e.teachers.add(l.teacherName);
    if (l.date > e.lastTaught) e.lastTaught = l.date;
  }
  const units = Array.from(map.values())
    .map((u) => ({
      ...u,
      areas: Array.from(u.areas),
      classes: Array.from(u.classes),
      teachers: Array.from(u.teachers).sort(),
      subUnits: Array.from(u.subUnits, ([title, progress]) => ({ title, ...progress })),
    }))
    .sort((a, b) => (a.lastTaught < b.lastTaught ? 1 : -1));

  return Response.json({ units });
}
