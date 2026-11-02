/*
 * Lesson-plan model — faithful port of server/plans.js (legacy):
 * unit extraction, similarity fingerprinting, plan summaries and
 * row→lesson expansion. Runs identically on the relational schema.
 */

import { prisma } from "./db";
import { slugify } from "./util";

/** The unit/topic is the first line of the competence text. */
export function extractUnit(text: string | null | undefined): string {
  return String(text ?? "")
    .split(/[\n;•]+/)
    .map((s) => s.trim())
    .filter(Boolean)[0] ?? "";
}

/** A lightweight similarity fingerprint: normalized words, deduped. */
export function fingerprint(text: string | null | undefined): string {
  const words = String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  return Array.from(new Set(words)).sort().slice(0, 120).join(" ");
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const A = new Set(a.split(" "));
  const B = new Set(b.split(" "));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.max(A.size, B.size);
}

export function planSummary(p: {
  id: string;
  schoolId: string;
  teacherId: string;
  teacherName: string;
  academicYearId: string;
  yearLabel: string;
  term: number;
  date: string;
  status: string;
  approvedByName: string;
  feedback?: string;
  rows: { className?: string | null; learningArea?: string | null }[];
  updatedAt: Date;
}) {
  return {
    id: p.id,
    schoolId: p.schoolId,
    teacherId: p.teacherId,
    teacherName: p.teacherName,
    academicYearId: p.academicYearId,
    yearLabel: p.yearLabel,
    term: p.term,
    date: p.date,
    status: p.status,
    approvedByName: p.approvedByName,
    feedback: p.feedback ?? "",
    rows: p.rows.length,
    classes: Array.from(new Set(p.rows.map((r) => r.className).filter(Boolean))) as string[],
    areas: Array.from(new Set(p.rows.map((r) => r.learningArea).filter(Boolean))) as string[],
    updatedAt: p.updatedAt,
  };
}

/** All plans for a teacher+year, newest date first (legacy ordering). */
export async function listForTeacher(teacherId: string, academicYearId: string) {
  return prisma.plan.findMany({
    where: { teacherId, academicYearId },
    orderBy: [{ date: "desc" }, { term: "asc" }],
    include: { rows: { orderBy: { position: "asc" } } },
  });
}

/** Reusable rows (published plans) filtered by class and/or learning area. */
export async function findReusable(opts: {
  schoolId: string;
  classId?: string;
  learningAreaId?: string;
  excludePlanId?: string;
  limit?: number;
}) {
  const plans = await prisma.plan.findMany({
    where: {
      schoolId: opts.schoolId,
      status: "published",
      ...(opts.excludePlanId ? { id: { not: opts.excludePlanId } } : {}),
    },
    include: { rows: { orderBy: { position: "asc" } } },
    orderBy: { date: "desc" },
    take: 400,
  });
  const out: {
    lessonId: string;
    planId: string;
    date: string;
    yearLabel: string;
    term: number;
    teacherName: string;
    teacherId: string;
    className: string;
    classId: string;
    learningArea: string;
    learningAreaId: string;
    subUnit: string;
    unit: string;
    competence: string;
    procedure: string;
  }[] = [];
  for (const p of plans) {
    for (const r of p.rows) {
      if (opts.classId && r.classId !== opts.classId) continue;
      if (opts.learningAreaId && r.learningAreaId !== opts.learningAreaId) continue;
      out.push({
        lessonId: r.id,
        planId: p.id,
        date: p.date,
        yearLabel: p.yearLabel,
        term: p.term,
        teacherName: p.teacherName,
        teacherId: p.teacherId,
        className: r.className,
        classId: r.classId,
        learningArea: r.learningArea,
        learningAreaId: r.learningAreaId,
        subUnit: r.subUnit,
        unit: extractUnit(r.competence),
        competence: r.competence,
        procedure: r.procedure,
      });
    }
  }
  out.sort((a, b) => (a.date < b.date ? 1 : -1));
  return out.slice(0, opts.limit ?? 50);
}

/**
 * "Similar lessons" engine — same class + learning area, word-fingerprint
 * similarity ≥ 0.25, best 5 (identical thresholds to the legacy server).
 */
export async function findSimilar(lesson: {
  planId: string;
  teacherId?: string;
  classId: string;
  learningAreaId: string;
  competence: string;
  procedure: string;
}) {
  const fp = fingerprint(lesson.competence + " " + lesson.procedure);
  const candidates = await prisma.lesson.findMany({
    where: {
      classId: lesson.classId,
      learningAreaId: lesson.learningAreaId,
      planId: { not: lesson.planId },
      // Suggest admin-approved lessons — or the author's own, pending ones.
      ...(lesson.teacherId ? { OR: [{ status: "published" }, { teacherId: lesson.teacherId }] } : { status: "published" }),
    },
    take: 500,
  });
  const scored = candidates
    .map((l) => ({ lesson: l, score: similarity(fp, fingerprint(l.competence + " " + l.procedure)) }))
    .filter((s) => s.score >= 0.25);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 5);
}

/** Build a row pre-filled from a source lesson (legacy applyLesson). */
export function applyLessonRow(
  source: { classId?: string; className?: string; learningAreaId?: string; learningArea?: string; subUnit?: string; competence?: string; procedure?: string },
  overrides: { classId?: string; className?: string; learningAreaId?: string; learningArea?: string }
) {
  return {
    time: "",
    classId: overrides.classId || source.classId || "",
    className: overrides.className || source.className || "",
    learningAreaId: overrides.learningAreaId || source.learningAreaId || "",
    learningArea: overrides.learningArea || source.learningArea || "",
    subUnit: source.subUnit || "",
    competence: source.competence || "",
    procedure: source.procedure || "",
  };
}

/**
 * Admin approves a plan → it enters the school-wide Lesson Library.
 * The owning plan keeps the approver's name for the "Approved" note.
 * @param feedback optional scalar feedback the admin types before approving.
 */
export async function approvePlan(
  planId: string,
  adminName: string,
  feedback: string = ""
): Promise<void> {
  await prisma.plan.update({
    where: { id: planId },
    data: {
      status: "published",
      approvedByName: adminName,
      approvedAt: new Date(),
      ...(feedback ? { feedback } : {}),
    },
  });
  await prisma.lesson.updateMany({ where: { planId }, data: { status: "published" } });
}

/**
 * A teacher edits an already-approved plan → back into the pending queue
 * so the Lesson Library only ever shows content the admin has approved.
 */
export async function markPlanPending(planId: string): Promise<void> {
  await prisma.plan.update({
    where: { id: planId },
    data: { status: "pending", approvedByName: "", approvedAt: null },
  });
  await prisma.lesson.updateMany({ where: { planId }, data: { status: "pending" } });
}

/**
 * Recompute the Lesson records for a plan (called on create/update/delete).
 * Lesson ids equal the PlanRow ids ("<planId>_r<n>") for legacy compatibility.
 */
export async function rebuildLessons(planId: string): Promise<void> {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: { rows: { orderBy: { position: "asc" } } },
  });
  if (!plan) return;
  const priorRows = await prisma.lesson.findMany({ where: { planId }, select: { id: true, teachingStatus: true } } as never) as unknown as { id: string; teachingStatus: string }[];
  const priorStatuses = new Map(priorRows.map((l) => [l.id, l.teachingStatus]));
  await prisma.lesson.deleteMany({ where: { planId } });
  if (plan.rows.length) {
    await prisma.lesson.createMany({
      data: plan.rows.map((r) => ({
        id: r.id,
        planId: plan.id,
        schoolId: plan.schoolId,
        teacherId: plan.teacherId,
        teacherName: plan.teacherName,
        yearLabel: plan.yearLabel,
        academicYearId: plan.academicYearId,
        term: plan.term,
        date: plan.date,
        time: r.time,
        classId: r.classId,
        className: r.className,
        levelId: r.levelId,
        learningAreaId: r.learningAreaId,
        learningArea: r.learningArea,
        unit: extractUnit(r.competence),
        subUnit: r.subUnit,
        competence: r.competence,
        procedure: r.procedure,
        status: plan.status === "published" ? "published" : "pending",
        teachingStatus: priorStatuses.get(r.id) ?? "planned",
        createdAt: plan.createdAt,
        updatedAt: new Date(),
      })),
    });
  }
}

export { slugify };
