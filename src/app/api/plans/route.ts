import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/session";
import { sanitizePlanInput } from "@/lib/plan-input";
import { validatePlanAssignments } from "@/lib/assignments";
import { rebuildLessons, planSummary } from "@/lib/plans";
import { getPlatformSettings } from "@/lib/platform";
import { str, isValidDate } from "@/lib/util";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/* GET /api/plans — the plan archive is shared school-wide (read-only);
   ?mine=1 restricts to the current user's own plans.
   ?status=pending|published filters by admin-approval state. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const url = new URL(req.url);
  const q = url.searchParams;
  const mine = q.get("mine") === "1";
  const year = q.get("year") || "";
  const teacher = q.get("teacher") || "";
  const status = q.get("status") || "";
  const text = str(q.get("q")).toLowerCase();
  const cls = q.get("class") || "";
  const classes = q.get("classes") || "";
  const area = q.get("area") || "";
  const dateFrom = q.get("from") || "";
  const dateTo = q.get("to") || "";
  const term = parseInt(q.get("term") ?? "", 10);

  const where: Prisma.PlanWhereInput = { schoolId: user.schoolId };
  if (mine) {
    where.teacherId = user.id;
  } else if (user.role !== "admin") {
    // Shared archive: colleagues only see admin-approved plans; the admin
    // sees everything so pending plans can be reviewed and approved.
    where.status = "published";
  }
  if (year) where.academicYearId = year;
  if (!mine && teacher) where.teacherId = teacher;
  const isStatusFilter = status === "pending" || status === "published";
  if (isStatusFilter) {
    where.status = status;
    // The approval queue is admin-only: a teacher may browse pending plans
    // only within their own archive (e.g. the My Plans status filter).
    if (status === "pending" && !mine && user.role !== "admin") where.teacherId = user.id;
  } else if (!mine && user.role !== "admin") {
    where.status = "published";
  }
  if (TERMS_OK.includes(term)) where.term = term;
  if (isValidDate(dateFrom)) where.date = { ...(where.date as object), gte: dateFrom };
  if (isValidDate(dateTo)) where.date = { ...(where.date as object), lte: dateTo };
  if (cls) where.rows = { some: { classId: cls } };
  if (classes) {
    const ids = classes.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length) where.rows = { some: { classId: { in: ids } } };
  }
  if (area) where.rows = { some: { learningAreaId: area } };

  let list = await prisma.plan.findMany({ where, include: { rows: true }, orderBy: [{ date: "desc" }, { id: "asc" }] });
  if (text) {
    const terms = text.split(/\s+/).filter(Boolean);
    list = list.filter((p) => {
      const hay = (
        p.teacherName +
        " " +
        p.date +
        " " +
        p.rows.map((r) => `${r.className} ${r.learningArea} ${r.competence} ${r.procedure}`).join(" ")
      ).toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }
  return Response.json({ plans: list.map(planSummary) });
}

const TERMS_OK = [1, 2, 3];

/* POST /api/plans — create a daily plan; rows expand into lesson records. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const settings = await getPlatformSettings();
  if (!settings.features.planner) {
    return Response.json({ error: "The lesson planner is not available on this platform right now." }, { status: 403 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const schoolClasses = await prisma.class.findMany({ where: { schoolId: user.schoolId } });
  const { errors, date, term, yearId, rows } = sanitizePlanInput(body, schoolClasses);
  if (errors.length) return Response.json({ error: errors[0], errors }, { status: 400 });
  const assignmentError = await validatePlanAssignments(user, rows);
  if (assignmentError) return Response.json({ error: assignmentError }, { status: 400 });
  const year = await prisma.academicYear.findFirst({ where: { id: yearId, schoolId: user.schoolId } });
  if (!year) return Response.json({ error: "Select a valid academic year." }, { status: 400 });
  if (year.startDate && date < year.startDate) {
    return Response.json({ error: `Date is before the academic year starts (${year.startDate}).` }, { status: 400 });
  }
  if (year.endDate && date > year.endDate) {
    return Response.json({ error: `Date is after the academic year ends (${year.endDate}).` }, { status: 400 });
  }
  const seq = await nextSeq();
  const id = "plan_" + seq.toString(36);
  // Teacher saves need admin approval before the plan enters the shared
  // Lesson Library; the admin's own saves are approved on the spot.
  const approved = user.role === "admin";
  const plan = await prisma.plan.create({
    data: {
      id,
      schoolId: user.schoolId,
      teacherId: user.id,
      teacherName: user.name,
      academicYearId: year.id,
      yearLabel: year.label,
      term,
      date,
      status: approved ? "published" : "pending",
      approvedByName: approved ? user.name : "",
      rows: { create: rows.map((r, i) => ({
        // PlanRow fields only — these never belong on the Plan object itself,
        // so they are picked out explicitly instead of spread in ("subUnit",
        // "id" and "position" were what the server rejected).
        id: `${id}_r${i + 1}`,
        position: i + 1,
        time: r.time,
        classId: r.classId,
        className: r.className,
        levelId: r.levelId,
        stream: r.stream ?? null,
        learningAreaId: r.learningAreaId,
        learningArea: r.learningArea,
        subUnit: r.subUnit,
        competence: r.competence,
        procedure: r.procedure,
      })) },
    },
    include: { rows: { orderBy: { position: "asc" } } },
  });
  await rebuildLessons(plan.id);
  return Response.json({ plan: planSummary(plan) }, { status: 201 });
}

/* Same id sequence scheme as the legacy server (meta.seq). */
async function nextSeq(): Promise<number> {
  const key = "seq";
  const rec = await prisma.meta.findUnique({ where: { key } });
  const n = (rec ? parseInt(rec.value, 10) : 1000) + 1;
  if (rec) await prisma.meta.update({ where: { key }, data: { value: String(n) } });
  else await prisma.meta.create({ data: { key, value: String(n) } });
  return n;
}
