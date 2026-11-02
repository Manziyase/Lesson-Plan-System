/*
 * Teacher ↔ class ↔ subject assignments.
 *
 * A TeachingAssignment row means exactly one teacher teaches one school
 * subject to one class. This replaces the old "subjects + classes" cross
 * product, which wrongly implied a teacher taught every selected subject to
 * every selected class.
 */

import type { Prisma } from "@prisma/client";
import type { SessionUser } from "./session";
import { prisma } from "./db";
import { str } from "./util";

export type AssignmentView = {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
};

export type AssignmentInput = {
  classId: string;
  subjectIds: string[];
};

export class AssignmentError extends Error {}

/** Accept either { classId, subjectIds: [] } or { classId, subjectId }. */
export function parseAssignmentInput(value: unknown): AssignmentInput[] | null {
  if (!Array.isArray(value)) return null;
  const out: AssignmentInput[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const classId = str(row.classId);
    if (!classId) continue;
    const subjectIds = Array.isArray(row.subjectIds)
      ? row.subjectIds.map((s) => str(s)).filter(Boolean)
      : [str(row.subjectId)].filter(Boolean);
    out.push({ classId, subjectIds: Array.from(new Set(subjectIds)) });
  }
  return out;
}

/** Legacy clients sent separate `subjects` and `classes` arrays. */
export function legacyAssignments(subjects: unknown, classes: unknown): AssignmentInput[] {
  if (!Array.isArray(subjects) || !Array.isArray(classes)) return [];
  const subjectIds = Array.from(new Set(subjects.map((s) => str(s)).filter(Boolean)));
  const classIds = Array.from(new Set(classes.map((c) => str(c)).filter(Boolean)));
  return classIds.map((classId) => ({ classId, subjectIds }));
}

function assignmentId(teacherId: string, classId: string, subjectId: string) {
  return `ta_${teacherId}_${classId}_${subjectId}`;
}

/**
 * Replace one teacher's assignments with exactly the supplied set.
 * Unrelated teachers are never touched. Class/subject ids must belong to the
 * same school, and duplicate class+subject pairs are collapsed.
 */
export async function syncTeacherAssignments(
  tx: Prisma.TransactionClient,
  opts: { schoolId: string; teacherId: string; entries: AssignmentInput[] }
): Promise<AssignmentView[]> {
  const { schoolId, teacherId, entries } = opts;
  const classIds = Array.from(new Set(entries.map((e) => e.classId)));
  const subjectIds = Array.from(new Set(entries.flatMap((e) => e.subjectIds)));

  const [classes, subjects] = await Promise.all([
    classIds.length
      ? tx.class.findMany({ where: { schoolId, id: { in: classIds } } })
      : Promise.resolve([]),
    subjectIds.length
      ? tx.subject.findMany({ where: { schoolId, id: { in: subjectIds } } })
      : Promise.resolve([]),
  ]);
  const classById = new Map(classes.map((c) => [c.id, c]));
  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  const desired: { id: string; schoolId: string; teacherId: string; classId: string; subjectId: string }[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const cls = classById.get(entry.classId);
    if (!cls) throw new AssignmentError("One of the selected classes does not belong to this school.");
    for (const subjectId of entry.subjectIds) {
      const subject = subjectById.get(subjectId);
      if (!subject) throw new AssignmentError("One of the selected subjects does not belong to this school.");
      const key = `${cls.id}|${subject.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      desired.push({
        id: assignmentId(teacherId, cls.id, subject.id),
        schoolId,
        teacherId,
        classId: cls.id,
        subjectId: subject.id,
      });
    }
  }

  const existing = await tx.teachingAssignment.findMany({ where: { schoolId, teacherId } });
  const existingKeys = new Set(existing.map((a) => `${a.classId}|${a.subjectId}`));
  const desiredKeys = new Set(desired.map((a) => `${a.classId}|${a.subjectId}`));

  const removeIds = existing.filter((a) => !desiredKeys.has(`${a.classId}|${a.subjectId}`)).map((a) => a.id);
  if (removeIds.length) {
    await tx.teachingAssignment.deleteMany({ where: { id: { in: removeIds } } });
  }
  const toCreate = desired.filter((a) => !existingKeys.has(`${a.classId}|${a.subjectId}`));
  if (toCreate.length) {
    await tx.teachingAssignment.createMany({ data: toCreate, skipDuplicates: true });
  }

  // Mirror the explicit pairs into the legacy JSON columns so older views
  // keep working while all new logic reads TeachingAssignment.
  const classNames = Array.from(new Set(desired.map((a) => classById.get(a.classId)!.name)));
  const subjectNames = Array.from(new Set(desired.map((a) => subjectById.get(a.subjectId)!.name)));
  await tx.user.update({
    where: { id: teacherId },
    data: {
      classes: JSON.stringify(classNames),
      subjects: JSON.stringify(subjectNames),
    },
  });

  return desired.map((a) => ({
    classId: a.classId,
    className: classById.get(a.classId)!.name,
    subjectId: a.subjectId,
    subjectName: subjectById.get(a.subjectId)!.name,
  }));
}

/**
 * Validate that the rows of a plan reference classes/subjects from this
 * school, and (for teachers) only pairs they are explicitly assigned to.
 * Blank rows are ignored so partially filled drafts still save.
 */
export async function validatePlanAssignments(
  user: SessionUser,
  rows: { classId: string; learningAreaId: string }[]
): Promise<string | null> {
  const meaningful = rows.filter((r) => r.classId || r.learningAreaId);
  if (!meaningful.length) return null;

  const [subjects, assignments] = await Promise.all([
    prismaSubjects(user.schoolId),
    user.role === "admin"
      ? Promise.resolve([])
      : prismaAssignments(user.schoolId, user.id),
  ]);
  const subjectIds = new Set(subjects);
  const assigned = new Set(assignments);

  for (const row of meaningful) {
    if (!row.learningAreaId) {
      return "Choose a learning area for every lesson row.";
    }
    if (!subjectIds.has(row.learningAreaId)) {
      return "That learning area is not offered by this school. Choose one from the Subjects section.";
    }
    if (user.role === "admin") {
      // Admins may plan for any class in the school; historical free-text
      // rows without a configured class id are still editable.
      continue;
    }
    if (!row.classId) {
      return "Choose a class for every lesson row.";
    }
    if (!assigned.has(`${row.classId}|${row.learningAreaId}`)) {
      return "You are not assigned to teach that subject in the selected class.";
    }
  }
  return null;
}

async function prismaSubjects(schoolId: string): Promise<string[]> {
  const rows = await prisma.subject.findMany({ where: { schoolId }, select: { id: true } });
  return rows.map((s) => s.id);
}

async function prismaAssignments(schoolId: string, teacherId: string): Promise<string[]> {
  const rows = await prisma.teachingAssignment.findMany({
    where: { schoolId, teacherId },
    select: { classId: true, subjectId: true },
  });
  return rows.map((a) => `${a.classId}|${a.subjectId}`);
}
