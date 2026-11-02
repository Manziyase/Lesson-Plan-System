import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/session";
import { sanitizePlanInput } from "@/lib/plan-input";
import { validatePlanAssignments } from "@/lib/assignments";
import { rebuildLessons, findSimilar, markPlanPending } from "@/lib/plans";
import { getPlatformSettings } from "@/lib/platform";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/* GET /api/plans/:id — readable across the school; suggests similar lessons.
   A plan still pending approval is visible only to its author and admins. */
export async function GET(req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const plan = await prisma.plan.findUnique({ where: { id }, include: { rows: { orderBy: { position: "asc" } } } });
  if (
    !plan ||
    plan.schoolId !== user.schoolId ||
    (plan.status !== "published" && plan.teacherId !== user.id && user.role !== "admin")
  ) {
    return Response.json({ error: "Plan not found." }, { status: 404 });
  }
  const similar = [];
  for (const r of plan.rows) {
    if (!r.classId || !r.learningAreaId) continue;      similar.push(
        ...(await findSimilar({
          planId: plan.id,
          teacherId: plan.teacherId,
          classId: r.classId,
        learningAreaId: r.learningAreaId,
        competence: r.competence,
        procedure: r.procedure,
      }))
    );
  }
  const seen = new Set<string>();
  const deduped = similar.filter((s) => (seen.has(s.lesson.id) ? false : (seen.add(s.lesson.id), true)));
  return Response.json({ plan, similar: deduped.slice(0, 6) });
}

/* PUT /api/plans/:id — author or admin only. */
export async function PUT(req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const settings = await getPlatformSettings();
  if (!settings.features.planner) {
    return Response.json({ error: "The lesson planner is not available on this platform right now." }, { status: 403 });
  }
  const { id } = await params;
  const plan = await prisma.plan.findUnique({ where: { id }, include: { rows: true } });
  if (!plan || plan.schoolId !== user.schoolId) {
    return Response.json({ error: "Plan not found." }, { status: 404 });
  }
  if (user.role !== "admin" && plan.teacherId !== user.id) {
    return Response.json({ error: "You can only edit your own plans." }, { status: 403 });
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

  const wasApproved = plan.status === "published";
  const updated = await prisma.$transaction(async (tx) => {
    await tx.planRow.deleteMany({ where: { planId: plan.id } });
    return tx.plan.update({
      where: { id: plan.id },
      data: {
        date,
        term,
        academicYearId: year.id,
        yearLabel: year.label,
        rows: { create: rows.map((r, i) => ({
        // PlanRow fields only — these never belong on the Plan object itself,
        // so they are picked out explicitly instead of spread in ("subUnit",
        // "id" and "position" were what the server rejected).
        id: `${plan.id}_r${i + 1}`,
        planId: plan.id,
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
  }, { maxWait: 10_000, timeout: 20_000 });
  // A teacher revising a plan the admin already approved must resubmit it
  // for approval; admin edits keep the plan approved.
  if (wasApproved && user.role !== "admin" && plan.teacherId === user.id) {
    await markPlanPending(plan.id);
  }
  await rebuildLessons(plan.id);
  const fresh = await prisma.plan.findUnique({ where: { id: plan.id } });
  if (fresh) updated.status = fresh.status;
  return Response.json({
    plan: {
      id: updated.id,
      schoolId: updated.schoolId,
      teacherId: updated.teacherId,
      teacherName: updated.teacherName,
      academicYearId: updated.academicYearId,
      yearLabel: updated.yearLabel,
      term: updated.term,
      date: updated.date,
      status: updated.status,
      approvedByName: updated.approvedByName,
      rows: updated.rows.length,
      classes: Array.from(new Set(updated.rows.map((r) => r.className).filter(Boolean))),
      areas: Array.from(new Set(updated.rows.map((r) => r.learningArea).filter(Boolean))),
      updatedAt: updated.updatedAt,
    },
  });
}

/* DELETE /api/plans/:id — author or admin only (lessons cascade). */
export async function DELETE(req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan || plan.schoolId !== user.schoolId) {
    return Response.json({ error: "Plan not found." }, { status: 404 });
  }
  if (user.role !== "admin" && plan.teacherId !== user.id) {
    return Response.json({ error: "You can only delete your own plans." }, { status: 403 });
  }
  await prisma.plan.delete({ where: { id: plan.id } });
  return Response.json({ ok: true });
}
