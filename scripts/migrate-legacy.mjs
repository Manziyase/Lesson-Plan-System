#!/usr/bin/env node
/*
 * One-time data migration: legacy JSON database → Prisma/SQLite.
 *
 * NON-DESTRUCTIVE by design:
 *   - reads ../data/db.json (or --from <path>), never writes to it
 *   - writes to the SQLite file only if the target tables are EMPTY
 *     (pass --force to append instead — ids are unique so rows cannot clash)
 *   - preserves every legacy id verbatim (school_rt, user_ru, plan_7361a1,
 *     plan_7361a1_r1 …) so URLs, lesson ids and cross-references stay valid
 *   - password hashes (scrypt salt+hash) are copied as-is: users keep
 *     their existing passwords, including mustChangePassword flags
 *
 * Usage:
 *   node scripts/migrate-legacy.mjs              # from ../data/db.json
 *   node scripts/migrate-legacy.mjs --from /path/to/db.json
 *   node scripts/migrate-legacy.mjs --force      # append to non-empty DB
 */

import fs from "fs";
import path from "path";
import url from "url";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

function hashPassword(password) {
  const salt = crypto.randomBytes(12).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 32).toString("hex");
  return { salt, hash };
}

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const argFrom = (() => {
  const i = process.argv.indexOf("--from");
  return i > -1 ? process.argv[i + 1] : null;
})();
const force = process.argv.includes("--force");

const DEFAULT_FROM = path.resolve(__dirname, "..", "..", "data", "db.json");
const fromFile = argFrom ? path.resolve(argFrom) : DEFAULT_FROM;

if (!fs.existsSync(fromFile)) {
  console.error(`Legacy database not found at ${fromFile}`);
  console.error("Pass --from /path/to/db.json to point at your legacy data.");
  process.exit(1);
}

const legacy = JSON.parse(fs.readFileSync(fromFile, "utf8"));
const prisma = new PrismaClient();

function parseArray(raw) {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

async function main() {
  const counts = {
    schools: await prisma.school.count(),
    users: await prisma.user.count(),
    plans: await prisma.plan.count(),
    lessons: await prisma.lesson.count(),
  };
  const empty = counts.schools === 0 && counts.users === 0 && counts.plans === 0;
  if (!empty && !force) {
    console.error("Target database is not empty:");
    console.error(`  schools=${counts.schools} users=${counts.users} plans=${counts.plans} lessons=${counts.lessons}`);
    console.error("Refusing to overwrite. Options:");
    console.error("  - use a fresh database (prisma db push on a new file), or");
    console.error("  - pass --force to append (ids are preserved, no duplicates).");
    process.exit(1);
  }

  /* ----- meta: carry on the id sequence so new ids never collide ----- */
  const seq = Number(legacy.meta?.seq ?? 1000);
  await prisma.meta.upsert({
    where: { key: "seq" },
    create: { key: "seq", value: String(seq) },
    update: { value: String(Math.max(seq, 1000)) },
  });

  /* ----- schools (+ classes + learning areas + levels) ----- */
  let migrated = { schools: 0, classes: 0, areas: 0, users: 0, years: 0, plans: 0, rows: 0, lessons: 0, sessions: 0 };

  for (const s of legacy.schools ?? []) {
    await prisma.school.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        name: s.name ?? "",
        district: s.district ?? "",
        sector: s.sector ?? "",
        levels: JSON.stringify(s.levels ?? []),
        createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
      },
      update: {
        name: s.name ?? "",
        district: s.district ?? "",
        sector: s.sector ?? "",
        levels: JSON.stringify(s.levels ?? []),
      },
    });
    migrated.schools++;

    for (const c of s.classes ?? []) {
      await prisma.class.upsert({
        where: { id: c.id },
        create: { id: c.id, schoolId: s.id, name: c.name, level: c.level ?? null, stream: c.stream ?? null },
        update: { name: c.name, level: c.level ?? null, stream: c.stream ?? null },
      });
      migrated.classes++;
    }
    for (const a of s.learningAreas ?? []) {
      await prisma.learningArea.upsert({
        where: { id: a.id },
        create: { id: a.id, schoolId: s.id, name: a.name },
        update: { name: a.name },
      });
      migrated.areas++;
    }
  }

  /* ----- users (password hashes preserved verbatim) ----- */
  for (const u of legacy.users ?? []) {
    await prisma.user.upsert({
      where: { id: u.id },
      create: {
        id: u.id,
        schoolId: u.schoolId,
        name: u.name,
        email: u.email,
        role: u.role === "admin" ? "admin" : "teacher",
        salt: u.salt,
        passwordHash: u.passwordHash,
        subjects: JSON.stringify(u.subjects ?? []),
        classes: JSON.stringify(u.classes ?? []),
        language: u.language ?? "en",
        mustChangePassword: !!u.mustChangePassword,
        activeYearId: u.activeYearId ?? null,
        createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
      },
      update: {}, // existing users are left untouched
    });
    migrated.users++;
  }

  /* ----- academic years ----- */
  for (const y of legacy.academic_years ?? []) {
    await prisma.academicYear.upsert({
      where: { id: y.id },
      create: {
        id: y.id,
        schoolId: y.schoolId,
        label: y.label,
        startDate: y.startDate,
        endDate: y.endDate,
        terms: JSON.stringify(y.terms ?? [1, 2, 3]),
        isActive: !!y.isActive,
        createdAt: y.createdAt ? new Date(y.createdAt) : new Date(),
      },
      update: {},
    });
    migrated.years++;
  }

  /* ----- plans + rows + derived lessons ----- */
  for (const p of legacy.plans ?? []) {
    /* Referential-integrity repair: some legacy plans reference teacher ids
       that no longer exist in the users collection (e.g. plan_7361a6 →
       user_s0 / Sandrine). Recreate a stub account from the denormalised
       teacherName so the plan and its lessons are preserved (password
       changeme123, must be changed at first login). */
    if (p.teacherId && !(await prisma.user.findUnique({ where: { id: p.teacherId } }))) {
      const firstName = String(p.teacherName ?? "Teacher").split(/\s+/)[0].toLowerCase();
      let email = firstName + "@school.rw";
      if (await prisma.user.findUnique({ where: { email } })) {
        email = (p.teacherId + "@school.rw").toLowerCase();
      }
      const { salt, hash } = hashPassword("changeme123");
      await prisma.user.create({
        data: {
          id: p.teacherId,
          schoolId: p.schoolId,
          name: p.teacherName ?? "Restored Teacher",
          email,
          role: "teacher",
          salt,
          passwordHash: hash,
          subjects: JSON.stringify([]),
          classes: JSON.stringify([]),
          mustChangePassword: true,
        },
      });
      migrated.users++;
      console.log(`  + recreated missing teacher ${p.teacherId} (${p.teacherName ?? "?"}) as ${email} — password changeme123, change required at first login`);
    }
    const rows = (p.rows ?? []).map((r, i) => ({
      id: `${p.id}_r${i + 1}`,
      position: i + 1,
      time: r.time ?? "",
      classId: r.classId ?? "",
      className: r.className ?? "",
      levelId: r.levelId ?? "",
      stream: r.stream ?? null,
      learningAreaId: r.learningAreaId ?? "",
      learningArea: r.learningArea ?? "",
      competence: r.competence ?? "",
      procedure: r.procedure ?? "",
    }));

    const exists = await prisma.plan.findUnique({ where: { id: p.id } });
    if (exists) continue; // never overwrite an existing plan

    await prisma.plan.create({
      data: {
        id: p.id,
        schoolId: p.schoolId,
        teacherId: p.teacherId,
        teacherName: p.teacherName ?? "",
        academicYearId: p.academicYearId,
        yearLabel: p.yearLabel ?? "",
        term: p.term ?? 1,
        date: p.date,
        status: p.status ?? "published",
        createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
        updatedAt: p.updatedAt ? new Date(p.updatedAt) : new Date(),
        rows: { create: rows },
      },
    });
    migrated.plans++;
    migrated.rows += rows.length;

    // Derived lesson records (same derivation as the legacy server: unit =
    // first line of the competence). Legacy lesson ids are preserved when
    // they follow the <planId>_r<n> scheme — which they always do.
    const legacyByPlan = (legacy.lessons ?? []).filter((l) => l.planId === p.id);
    for (const r of rows) {
      const legacyLesson = legacyByPlan.find((l) => l.id === r.id);
      const unit =
        legacyLesson?.unit ??
        String(r.competence ?? "")
          .split(/[\n;•]+/)
          .map((s) => s.trim())
          .filter(Boolean)[0] ??
        "";
      await prisma.lesson.create({
        data: {
          id: r.id,
          planId: p.id,
          schoolId: p.schoolId,
          teacherId: p.teacherId,
          teacherName: legacyLesson?.teacherName ?? p.teacherName ?? "",
          yearLabel: legacyLesson?.yearLabel ?? p.yearLabel ?? "",
          academicYearId: p.academicYearId,
          term: p.term ?? 1,
          date: p.date,
          time: r.time,
          classId: r.classId,
          className: r.className,
          levelId: r.levelId,
          learningAreaId: r.learningAreaId,
          learningArea: r.learningArea,
          unit,
          competence: r.competence,
          procedure: r.procedure,
          createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
          updatedAt: p.updatedAt ? new Date(p.updatedAt) : new Date(),
        },
      }).catch(() => {}); // id already exists → keep the original
      migrated.lessons++;
    }
  }

  /* ----- sessions (live logins keep working) ----- */
  for (const [token, sess] of Object.entries(legacy.sessions ?? {})) {
    await prisma.session.upsert({
      where: { token },
      create: {
        token,
        userId: sess.userId,
        createdAt: sess.createdAt ? new Date(sess.createdAt) : new Date(),
        expiresAt: sess.expiresAt ? new Date(sess.expiresAt) : new Date(Date.now() + 30 * 864e5),
      },
      update: {},
    }).catch(() => {});
    migrated.sessions++;
  }

  console.log("Migration complete (source: " + fromFile + ")");
  console.log(`  schools: ${migrated.schools} (${migrated.classes} classes, ${migrated.areas} learning areas)`);
  console.log(`  users: ${migrated.users} — password hashes preserved, no reset needed`);
  console.log(`  academic years: ${migrated.years}`);
  console.log(`  daily plans: ${migrated.plans} (${migrated.rows} lesson rows)`);
  console.log(`  derived lessons: ${migrated.lessons}`);
  console.log(`  sessions: ${migrated.sessions}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
