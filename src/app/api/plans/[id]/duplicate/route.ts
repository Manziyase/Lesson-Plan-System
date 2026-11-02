import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/session";
import { sanitizePlanInput } from "@/lib/plan-input";
import { validatePlanAssignments } from "@/lib/assignments";
import { rebuildLessons, planSummary } from "@/lib/plans";
import { getPlatformSettings } from "@/lib/platform";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/* POST /api/plans/:id/duplicate — any staff may copy a shared plan into their
   own archive; the copy is owned by the current user, the original untouched. */
export async function POST(req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const settings = await getPlatformSettings();
  if (!settings.features.planner) {
    return Response.json({ error: "The lesson planner is not available on this platform right now." }, { status: 403 });
  }
  const { id } = await params;
  const plan = await prisma.plan.findUnique({ where: { id }, include: { rows: { orderBy: { position: "asc" } } } });
  if (!plan || plan.schoolId !== user.schoolId) {
    return Response.json({ error: "Plan not found." }, { status: 404 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const schoolClasses = await prisma.class.findMany({ where: { schoolId: user.schoolId } });
  const { errors, date, term, yearId, rows } = sanitizePlanInput(
    { date: body.date, term: body.term, academicYearId: body.academicYearId, rows: plan.rows },
    schoolClasses
  );
  if (errors.length) return Response.json({ error: errors[0], errors }, { status: 400 });
  // A copy belongs to the current user, so the same assignment rules apply as
  // for creating a new plan: teachers cannot copy rows they may not teach.
  const assignmentError = await validatePlanAssignments(user, rows);
  if (assignmentError) return Response.json({ error: assignmentError }, { status: 400 });
  const year = await prisma.academicYear.findFirst({ where: { id: yearId, schoolId: user.schoolId } });
  if (!year) return Response.json({ error: "Select a valid academic year." }, { status: 400 });

  const seqRec = await prisma.meta.findUnique({ where: { key: "seq" } });
  const seq = (seqRec ? parseInt(seqRec.value, 10) : 1000) + 1;
  if (seqRec) await prisma.meta.update({ where: { key: "seq" }, data: { value: String(seq) } });
  else await prisma.meta.create({ data: { key: "seq", value: String(seq) } });
  const newId = "plan_" + seq.toString(36);

  const copy = await prisma.plan.create({
    data: {
      id: newId,
      schoolId: plan.schoolId,
      teacherId: user.id,
      teacherName: user.name,
      academicYearId: year.id,
      yearLabel: year.label,
      term,
      date,
      // A copied plan belongs to the current user, so it follows the same
      // approval rule as a fresh save: admin copies are approved at once.
      status: user.role === "admin" ? "published" : "pending",
      approvedByName: user.role === "admin" ? user.name : "",
      rows: {
        create: rows.map((r, i) => ({
          id: `${newId}_r${i + 1}`,
          position: i + 1,
          time: r.time,
          classId: r.classId,
          className: r.className,
          levelId: r.levelId,
          stream: r.stream,
          learningAreaId: r.learningAreaId,
          learningArea: r.learningArea,
          competence: r.competence,
          procedure: r.procedure,
        })),
      },
    },
    include: { rows: { orderBy: { position: "asc" } } },
  });
  await rebuildLessons(copy.id);
  return Response.json({ plan: planSummary(copy) }, { status: 201 });
}
