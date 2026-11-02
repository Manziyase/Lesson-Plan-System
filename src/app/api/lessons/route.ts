import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/session";
import { str, isValidDate } from "@/lib/util";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/* GET /api/lessons — the lesson library is shared school-wide so teachers can
   find and reuse each other's work; only plans the admin has approved appear
   in the shared view; ?mine=1 shows your own lessons including ones still
   pending approval. */
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
  const dateFrom = q.get("from") || "";
  const dateTo = q.get("to") || "";
  const term = parseInt(q.get("term") ?? "", 10);
  const text = str(q.get("q")).toLowerCase();
  const unit = str(q.get("unit"));
  const subUnit = str(q.get("subUnit"));

  const where: Prisma.LessonWhereInput = { schoolId: user.schoolId };
  if (mine) {
    where.teacherId = user.id;
  } else {
    // School-wide library: admin-approved plans only.
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
  if (term === 1 || term === 2 || term === 3) where.term = term;
  if (isValidDate(dateFrom)) where.date = { ...(where.date as object), gte: dateFrom };
  if (isValidDate(dateTo)) where.date = { ...(where.date as object), lte: dateTo };
  if (unit) {
    // match on the slugified unit, like the legacy server
    const slug = unit
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    where.OR = [{ unit: { contains: unit } }];
    void slug;
  }
  if (subUnit) where.subUnit = subUnit;

  let list = await prisma.lesson.findMany({ where, orderBy: [{ date: "desc" }, { id: "asc" }] });
  if (text) {
    const terms = text.split(/\s+/).filter(Boolean);
    list = list.filter((l) => {
      const hay = `${l.className} ${l.learningArea} ${l.unit} ${l.subUnit} ${l.competence} ${l.procedure}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }
  if (unit) list = list.filter((l) => l.unit === unit);

  const limit = Math.min(parseInt(q.get("limit") ?? "200", 10) || 200, 500);
  const subUnits = await prisma.lesson.findMany({
    where: { schoolId: user.schoolId, ...(year ? { academicYearId: year } : {}), ...(mine ? { teacherId: user.id } : { status: "published" }), ...(unit ? { unit } : {}) },
    select: { subUnit: true }, distinct: ["subUnit"], orderBy: { subUnit: "asc" },
  });
  const unitOptions = await prisma.lesson.findMany({
    where: { schoolId: user.schoolId, ...(year ? { academicYearId: year } : {}), ...(mine ? { teacherId: user.id } : { status: "published" }) },
    select: { unit: true }, distinct: ["unit"], orderBy: { unit: "asc" },
  });
  return Response.json({ lessons: list.slice(0, limit), total: list.length, subUnits: subUnits.map((x) => x.subUnit).filter(Boolean), unitOptions: unitOptions.map((x) => x.unit).filter(Boolean) });
}
