#!/usr/bin/env node
/*
 * Safe, idempotent migration for the class-specific teacher assignment model.
 *
 *   node --env-file=.env scripts/migrate-assignments.mjs
 *
 * What it does (never deletes anything):
 *   1. Seeds the school Subjects table from existing learning areas and any
 *      subject names already stored on user accounts.
 *   2. Rewrites plan row / lesson `learningAreaId` values from legacy
 *      LearningArea ids to the matching Subject ids (names preserved).
 *   3. Creates explicit TeachingAssignment rows from:
 *        - the legacy `subjects` x `classes` JSON on each user (preserves the
 *          access the old UI implied), and
 *        - every existing plan row/lesson (so old plans stay editable).
 *   4. Mirrors the resulting class/subject names back into the legacy JSON
 *      columns for older views.
 *
 * Running it twice is harmless: subjects, classes and assignments are all
 * matched by name/triple and duplicates are skipped.
 */

import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const norm = (value) => String(value ?? "").trim().toLowerCase();

function slug(name) {
  return String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "subject";
}

function deterministicSubjectId(schoolId, name) {
  const hash = crypto.createHash("sha1").update(`${schoolId}:${norm(name)}`).digest("hex").slice(0, 6);
  return `s-${slug(name)}-${hash}`;
}

function assignmentId(teacherId, classId, subjectId) {
  return `ta_${teacherId}_${classId}_${subjectId}`;
}

function parseNames(raw) {
  try {
    const value = JSON.parse(raw || "[]");
    return Array.isArray(value) ? value.map((v) => String(v)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function main() {
  const schools = await prisma.school.findMany({ select: { id: true, name: true } });
  console.log(`Migrating ${schools.length} school(s)…`);
  let createdSubjects = 0;
  let remappedRows = 0;
  let createdAssignments = 0;

  for (const school of schools) {
    const [areas, subjects, classes, users, plans] = await Promise.all([
      prisma.learningArea.findMany({ where: { schoolId: school.id } }),
      prisma.subject.findMany({ where: { schoolId: school.id } }),
      prisma.class.findMany({ where: { schoolId: school.id } }),
      prisma.user.findMany({ where: { schoolId: school.id } }),
      prisma.plan.findMany({ where: { schoolId: school.id }, include: { rows: true } }),
    ]);

    const subjectByName = new Map(subjects.map((s) => [norm(s.name), s]));
    const areaById = new Map(areas.map((a) => [a.id, a]));
    const classByName = new Map(classes.map((c) => [norm(c.name), c]));
    const subjectById = new Map(subjects.map((s) => [s.id, s]));

    /** Exact class name first; then a configured class used as a prefix
     *  ("P3 SET" → P3) so legacy free-text rows become editable. */
    function matchClass(name) {
      const key = norm(name);
      if (!key) return null;
      if (classByName.has(key)) return classByName.get(key);
      const sorted = classes.slice().sort((a, b) => b.name.length - a.name.length);
      return (
        sorted.find((c) => {
          const ck = norm(c.name);
          return ck && (key.startsWith(`${ck} `) || key.startsWith(`${ck}(`) || key.startsWith(`${ck}-`));
        }) ?? null
      );
    }

    async function ensureSubject(name) {
      const clean = String(name ?? "").trim();
      if (!clean) return null;
      const key = norm(clean);
      if (subjectByName.has(key)) return subjectByName.get(key);
      let id = deterministicSubjectId(school.id, clean);
      if (await prisma.subject.findUnique({ where: { id } })) {
        id = `${id}-${crypto.randomUUID().slice(0, 4)}`;
      }
      const created = await prisma.subject.create({
        data: { id, schoolId: school.id, name: clean.slice(0, 80) },
      });
      subjectByName.set(key, created);
      subjectById.set(created.id, created);
      createdSubjects += 1;
      return created;
    }

    // 1. Subjects from learning areas and legacy profile subject names.
    for (const area of areas) await ensureSubject(area.name);
    for (const user of users) {
      for (const name of parseNames(user.subjects)) await ensureSubject(name);
    }

    // 2/3. Remap plan rows to subject ids and collect assignment triples.
    const triples = new Set();
    const addTriple = (teacherId, classId, subjectId) => {
      if (teacherId && classId && subjectId) triples.add(`${teacherId}|${classId}|${subjectId}`);
    };

    for (const plan of plans) {
      for (const row of plan.rows) {
        let subject = row.learningAreaId ? subjectById.get(row.learningAreaId) : null;
        if (!subject && row.learningAreaId && areaById.has(row.learningAreaId)) {
          subject = subjectByName.get(norm(areaById.get(row.learningAreaId).name)) ?? null;
        }
        if (!subject && row.learningArea) subject = await ensureSubject(row.learningArea);
        if (!subject) continue;

        const matchedClass = matchClass(row.className) ?? classes.find((c) => c.id === row.classId) ?? null;
        const classId = matchedClass ? matchedClass.id : row.classId;
        const needsRowUpdate =
          row.learningAreaId !== subject.id ||
          row.learningArea !== subject.name ||
          Boolean(matchedClass) && row.classId !== matchedClass.id;
        if (needsRowUpdate) {
          await prisma.planRow.update({
            where: { id: row.id },
            data: {
              learningAreaId: subject.id,
              learningArea: subject.name,
              ...(matchedClass ? { classId: matchedClass.id } : {}),
            },
          });
          remappedRows += 1;
        }

        addTriple(plan.teacherId, classId, subject.id);
      }
    }

    // Lessons are derived from rows but older databases may have stray ones.
    const lessons = await prisma.lesson.findMany({ where: { schoolId: school.id } });
    for (const lesson of lessons) {
      let subject = lesson.learningAreaId ? subjectById.get(lesson.learningAreaId) : null;
      if (!subject && lesson.learningAreaId && areaById.has(lesson.learningAreaId)) {
        subject = subjectByName.get(norm(areaById.get(lesson.learningAreaId).name)) ?? null;
      }
      if (!subject && lesson.learningArea) subject = await ensureSubject(lesson.learningArea);
      if (subject) {
        const matchedClass = matchClass(lesson.className) ?? classes.find((c) => c.id === lesson.classId) ?? null;
        const classId = matchedClass ? matchedClass.id : lesson.classId;
        const needsLessonUpdate =
          lesson.learningAreaId !== subject.id ||
          lesson.learningArea !== subject.name ||
          Boolean(matchedClass) && lesson.classId !== matchedClass.id;
        if (needsLessonUpdate) {
          await prisma.lesson.update({
            where: { id: lesson.id },
            data: {
              learningAreaId: subject.id,
              learningArea: subject.name,
              ...(matchedClass ? { classId: matchedClass.id } : {}),
            },
          });
          remappedRows += 1;
        }
        addTriple(lesson.teacherId, classId, subject.id);
      }
    }

    // Legacy profile cross product: keep the access teachers had before.
    for (const user of users) {
      const names = parseNames(user.subjects);
      const classNames = parseNames(user.classes);
      for (const className of classNames) {
        const cls = classByName.get(norm(className));
        if (!cls) continue;
        for (const name of names) {
          const subject = await ensureSubject(name);
          if (subject) addTriple(user.id, cls.id, subject.id);
        }
      }
    }

    if (triples.size) {
      const rows = Array.from(triples).map((key) => {
        const [teacherId, classId, subjectId] = key.split("|");
        return {
          id: assignmentId(teacherId, classId, subjectId),
          schoolId: school.id,
          teacherId,
          classId,
          subjectId,
        };
      });
      const result = await prisma.teachingAssignment.createMany({ data: rows, skipDuplicates: true });
      createdAssignments += result.count;
    }

    // 4. Mirror explicit assignments into the legacy JSON columns.
    const assignments = await prisma.teachingAssignment.findMany({
      where: { schoolId: school.id },
      include: { class: true, subject: true },
    });
    const byTeacher = new Map();
    for (const a of assignments) {
      const entry = byTeacher.get(a.teacherId) ?? { classes: new Set(), subjects: new Set() };
      entry.classes.add(a.class.name);
      entry.subjects.add(a.subject.name);
      byTeacher.set(a.teacherId, entry);
    }
    for (const user of users) {
      const entry = byTeacher.get(user.id);
      if (!entry) continue;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          classes: JSON.stringify(Array.from(entry.classes)),
          subjects: JSON.stringify(Array.from(entry.subjects)),
        },
      });
    }

    console.log(
      `  ${school.name || school.id}: subjects +${createdSubjects}, rows remapped ${remappedRows}, assignments +${createdAssignments}`
    );
    // Reset per-school counters only for reporting clarity.
    createdSubjects = 0;
    remappedRows = 0;
    createdAssignments = 0;
  }

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
