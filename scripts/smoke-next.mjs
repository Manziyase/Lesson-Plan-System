#!/usr/bin/env node
/*
 * End-to-end smoke test for the Next.js backend — port of the legacy
 * scripts/smoke.js. Boots the production server (next start) on an ephemeral
 * port with a temp SQLite file, migrates legacy demo data in, and exercises
 * the whole API surface: auth, RBAC, plans, lessons, years, teachers,
 * school config, dashboard, sharing rules.
 *
 * Run: npm run build && npm run smoke
 */

import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ireme-next-"));
const dbFile = path.join(tmp, "test.db");
process.env.DATABASE_URL = "file:" + dbFile;
const PORT = 3900 + Math.floor(Math.random() * 100);
process.env.PORT = String(PORT);

let passed = 0;
let failed = 0;
function ok(cond, label) {
  if (cond) {
    passed++;
    console.log("  ✓ " + label);
  } else {
    failed++;
    console.error("  ✗ " + label);
  }
}

function req(method, urlPath, { body, cookie } = {}) {
  return fetch(`http://127.0.0.1:${PORT}${urlPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then(async (res) => {
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* no body */
    }
    const setCookie = res.headers.get("set-cookie");
    return { status: res.status, data, setCookie };
  });
}

function cookieOf(r) {
  return (r.setCookie || "").split(";")[0];
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function startServer() {
  const child = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: __dirname + "/..",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  child.stdout.on("data", (d) => process.stdout.write("  [server] " + d));
  child.stderr.on("data", (d) => process.stderr.write("  [server] " + d));
  // wait for readiness
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (r.ok) return child;
    } catch {
      /* not up yet */
    }
    await wait(500);
  }
  throw new Error("Server did not become ready");
}

async function main() {
  // Build the schema into the temp DB, then migrate legacy demo data in.
  const { execSync } = await import("child_process");
  execSync("npx prisma db push --skip-generate", {
    cwd: __dirname + "/..",
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  // Isolated legacy data for the test: a small db.json written to temp.
  const legacy = {
    meta: { version: 1, seq: 1023 },
    schools: [
      {
        id: "school_rt",
        name: "GS Kanyinya",
        district: "Nyarugenge",
        sector: "Kanyinya",
        levels: ["N1", "P1", "P5", "S1"],
        classes: [
          { id: "class_sb", name: "P4", level: "P4", stream: null },
          { id: "class_sc", name: "P5", level: "P5", stream: null },
          { id: "class_sd", name: "P6", level: "P6", stream: null },
        ],
        learningAreas: [
          { id: "a-math", name: "Mathematics" },
          { id: "a-eng", name: "English" },
          { id: "a-kiny", name: "Kinyarwanda" },
          { id: "a-sci", name: "Science & Elementary Technology" },
        ],
      },
    ],
    users: [],
    academic_years: [],
    plans: [],
    lessons: [],
    sessions: {},
  };
  // Reuse the demo seed's user/plan fixtures via the migrate script by
  // writing a minimal but complete legacy DB (users with REAL scrypt hashes
  // of 'changeme123' computed here).
  const crypto = await import("crypto");
  function hash(pw) {
    const salt = crypto.randomBytes(12).toString("hex");
    const hash = crypto.scryptSync(pw, salt, 32).toString("hex");
    return { salt, hash };
  }
  const jean = hash("changeme123");
  const aline = hash("changeme123");
  legacy.users = [
    {
      id: "user_ru",
      schoolId: "school_rt",
      name: "Aline Uwase",
      email: "admin@school.rw",
      role: "admin",
      salt: aline.salt,
      passwordHash: aline.hash,
      subjects: ["Mathematics"],
      classes: ["P5"],
      mustChangePassword: false,
      createdAt: "2026-09-29T10:16:01.375Z",
      activeYearId: "year_s2",
      language: "en",
    },
    {
      id: "user_rv",
      schoolId: "school_rt",
      name: "Jean Bosco Nsengimana",
      email: "jean@school.rw",
      role: "teacher",
      salt: jean.salt,
      passwordHash: jean.hash,
      subjects: ["Mathematics"],
      classes: ["P1", "P2"],
      mustChangePassword: false,
      createdAt: "2026-09-29T10:16:01.375Z",
      language: "en",
    },
  ];
  legacy.academic_years = [
    { id: "year_s1", schoolId: "school_rt", label: "2025-2026", startDate: "2025-09-08", endDate: "2026-07-03", terms: [1, 2, 3], isActive: false, createdAt: "2026-09-29T10:16:01.375Z" },
    { id: "year_s2", schoolId: "school_rt", label: "2026-2027", startDate: "2026-09-07", endDate: "2027-07-02", terms: [1, 2, 3], isActive: true, createdAt: "2026-09-29T10:16:01.375Z" },
  ];
  legacy.plans = [
    {
      id: "plan_7361a1",
      schoolId: "school_rt",
      teacherId: "user_rv",
      teacherName: "Jean Bosco Nsengimana",
      academicYearId: "year_s1",
      yearLabel: "2025-2026",
      term: 1,
      date: "2025-09-08",
      status: "published",
      rows: [
        { time: "08:00-08:40", classId: "class_sc", className: "P5", learningAreaId: "a-math", learningArea: "Mathematics", competence: "Unit 5: Multiplication of whole numbers\nSubUnit 5.2 Multiplying by 10 and 100", procedure: "- Write 34 x 10 on the board; pupils solve in pairs.\n- Place-value cards." },
        { time: "08:40-09:20", classId: "class_sd", className: "P6", learningAreaId: "a-math", learningArea: "Mathematics", competence: "Unit 5: Multiplication of whole numbers\nSubUnit 5.2 Multiplying by 10 and 100", procedure: "- Review tables.\n- Pattern demonstration." },
      ],
      createdAt: "2026-09-29T10:16:01.375Z",
      updatedAt: "2026-09-29T10:16:01.375Z",
    },
    {
      id: "plan_7361a2",
      schoolId: "school_rt",
      teacherId: "user_ru",
      teacherName: "Aline Uwase",
      academicYearId: "year_s1",
      yearLabel: "2025-2026",
      term: 1,
      date: "2025-09-09",
      status: "published",
      rows: [
        { time: "08:00-08:40", classId: "class_sb", className: "P4", learningAreaId: "a-math", learningArea: "Mathematics", competence: "Unit 9: Fractions\nSubUnit 9.1 Equivalent fractions", procedure: "- Fraction wall demonstration.\n- Paper folding." },
      ],
      createdAt: "2026-09-29T10:16:01.375Z",
      updatedAt: "2026-09-29T10:16:01.375Z",
    },
  ];
  legacy.lessons = [];
  for (const p of legacy.plans) {
    p.rows.forEach((r, i) => {
      legacy.lessons.push({
        id: p.id + "_r" + (i + 1),
        planId: p.id,
        schoolId: p.schoolId,
        teacherId: p.teacherId,
        teacherName: p.teacherName,
        yearLabel: p.yearLabel,
        academicYearId: p.academicYearId,
        term: p.term,
        date: p.date,
        time: r.time,
        classId: r.classId,
        className: r.className,
        levelId: "",
        learningAreaId: r.learningAreaId,
        learningArea: r.learningArea,
        unit: String(r.competence).split("\n")[0],
        competence: r.competence,
        procedure: r.procedure,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      });
    });
  }
  const legacyFile = path.join(tmp, "legacy-db.json");
  fs.writeFileSync(legacyFile, JSON.stringify(legacy));

  execSync(`node scripts/migrate-legacy.mjs --from "${legacyFile}"`, {
    cwd: __dirname + "/..",
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  const server = await startServer();
  let exited = false;
  server.on("exit", () => (exited = true));

  try {
    console.log("\n— auth —");
    let r = await req("POST", "/api/auth/login", { body: { email: "jean@school.rw", password: "changeme123" } });
    ok(r.status === 200 && r.data.user?.id === "user_rv", "migrated teacher logs in with legacy password");
    ok(cookieOf(r).startsWith("slp_session="), "session cookie set");
    const teacherCookie = cookieOf(r);

    r = await req("POST", "/api/auth/login", { body: { email: "jean@school.rw", password: "nope" } });
    ok(r.status === 401, "wrong password rejected");

    r = await req("GET", "/api/plans");
    ok(r.status === 401, "unauthenticated request blocked");

    console.log("— meta —");
    r = await req("GET", "/api/meta", { cookie: teacherCookie });
    ok(r.status === 200 && r.data.classes.length === 3, "meta: classes (3 from legacy config)");
    ok(r.data.learningAreas.length >= 4, "meta: learning areas");
    ok(r.data.activeYear?.isActive === true, "meta: active year");
    const meta = r.data;

    console.log("— plans & sharing —");
    r = await req("GET", "/api/plans?mine=1", { cookie: teacherCookie });
    ok(r.status === 200 && r.data.plans.length === 1 && r.data.plans[0].teacherName.includes("Jean"), "mine=1 returns only own plans");
    r = await req("GET", "/api/plans", { cookie: teacherCookie });
    ok(r.status === 200 && r.data.plans.length === 2, "school-wide list includes coworkers");

    const otherPlan = r.data.plans.find((p) => !p.teacherName.includes("Jean"));
    r = await req("GET", "/api/plans/" + otherPlan.id, { cookie: teacherCookie });
    ok(r.status === 200 && r.data.plan.rows.length === 1, "teacher can read a coworker plan");
    r = await req("PUT", "/api/plans/" + otherPlan.id, { cookie: teacherCookie, body: { date: otherPlan.date, term: otherPlan.term, academicYearId: meta.activeYear.id, rows: [] } });
    ok(r.status === 403, "teacher cannot edit a coworker plan");
    r = await req("DELETE", "/api/plans/" + otherPlan.id, { cookie: teacherCookie });
    ok(r.status === 403, "teacher cannot delete a coworker plan");
    r = await req("GET", "/api/plans/" + otherPlan.id, { cookie: teacherCookie });
    ok((r.data.plan?.similar ?? []).length >= 0 && Array.isArray(r.data.similar), "plan detail includes similar-lesson suggestions");

    console.log("— create plan (4-column rows → lessons) —");
    r = await req("POST", "/api/plans", {
      cookie: teacherCookie,
      body: {
        date: "2026-09-09",
        term: 1,
        academicYearId: meta.activeYear.id,
        rows: [
          { time: "08:00-08:40", className: "P5", learningAreaId: "a-math", learningArea: "Mathematics", competence: "Unit 11: Decimals\nSubUnit 11.1 Place value", procedure: "- intro\n- examples" },
          { time: "08:40-09:20", className: "P6", learningAreaId: "a-math", learningArea: "Mathematics", competence: "Unit 11: Decimals\nSubUnit 11.2 Ordering", procedure: "- recap\n- group work" },
        ],
      },
    });
    ok(r.status === 201 && r.data.plan?.rows === 2, "create daily plan with 2 rows");
    ok(r.data.plan?.classes?.join(",") === "P5,P6", "free-text classes linked to school classes");
    const planId = r.data.plan.id;

    console.log("— approval workflow (teacher save → admin approve → library) —");
    ok(r.data.plan.status === "pending", "teacher save starts pending approval");

    // Admin is needed for approvals; log in early for this section.
    r = await req("POST", "/api/auth/login", { body: { email: "admin@school.rw", password: "changeme123" } });
    const approvalAdminCookie = cookieOf(r);
    ok(r.status === 200, "admin login for approval workflow");

    r = await req("GET", "/api/lessons?mine=1&q=decimals", { cookie: teacherCookie });
    ok(r.status === 200 && r.data.total >= 2, "own pending lessons visible in My Lessons (" + r.data.total + ")");

    r = await req("GET", "/api/lessons?q=decimals", { cookie: teacherCookie });
    ok(r.status === 200 && !r.data.lessons.some((l) => l.planId === planId), "pending lessons hidden from school-wide library");

    r = await req("GET", "/api/lessons/units?mine=1", { cookie: teacherCookie });
    ok(r.status === 200 && r.data.units.some((u) => u.unit.startsWith("Unit 11")), "units list aggregates own pending lessons");

    r = await req("GET", "/api/lessons/units", { cookie: teacherCookie });
    ok(r.status === 200 && !r.data.units.some((u) => u.unit === "Unit 11: Decimals"), "school-wide units exclude pending plans");

    r = await req("POST", "/api/plans/" + planId + "/approve", { cookie: teacherCookie });
    ok(r.status === 403, "teacher cannot approve");
    r = await req("POST", "/api/plans/" + planId + "/approve");
    ok(r.status === 401, "unauthenticated approve blocked");

    r = await req("POST", "/api/plans/" + planId + "/approve", { cookie: approvalAdminCookie });
    ok(r.status === 200 && r.data.plan.status === "published", "admin approves pending plan");

    r = await req("GET", "/api/lessons?q=decimals", { cookie: teacherCookie });
    ok(r.status === 200 && r.data.lessons.some((l) => l.planId === planId), "approved lessons appear school-wide");

    r = await req("GET", "/api/meta", { cookie: approvalAdminCookie });
    ok(r.status === 200 && r.data.pendingPlans === 0, "admin pending-plans count clears after approval");

    console.log("— duplicate / edit / delete —");
    r = await req("POST", "/api/plans/" + planId + "/duplicate", { cookie: teacherCookie, body: { date: "2026-09-10", term: 1, academicYearId: meta.activeYear.id } });
    ok(r.status === 201 && r.data.plan.rows === 2, "duplicate plan carries rows");
    ok(r.data.plan.status === "pending", "teacher duplicate starts pending approval");
    const dupId = r.data.plan.id;
    r = await req("POST", "/api/plans/" + dupId + "/approve", { cookie: approvalAdminCookie });
    ok(r.status === 200 && r.data.plan.status === "published", "admin approves duplicate");

    r = await req("PUT", "/api/plans/" + planId, {
      cookie: teacherCookie,
      body: {
        date: "2026-09-09", term: 1, academicYearId: meta.activeYear.id,
        rows: [{ time: "08:00-08:40", className: "P5", learningAreaId: "a-math", learningArea: "Mathematics", competence: "Unit 11: Decimals (updated)", procedure: "updated" }],
      },
    });
    ok(r.status === 200, "update plan");
    r = await req("GET", "/api/lessons?mine=1&q=decimals%20(updated)", { cookie: teacherCookie });
    ok(r.data.total === 1, "lesson records rebuilt after edit (updated text findable, old row replaced)");
    r = await req("GET", "/api/lessons?q=decimals", { cookie: teacherCookie });
    ok(r.data.total === 2, "teacher edit re-pends the approved plan; library still shows only the approved duplicate (" + r.data.total + ")");
    r = await req("POST", "/api/plans/" + planId + "/approve", { cookie: approvalAdminCookie });
    ok(r.status === 200, "admin re-approves edited plan");
    r = await req("GET", "/api/lessons?q=decimals", { cookie: teacherCookie });
    ok(r.data.total === 3, "edited plan contributes 1 + duplicate still holds 2 decimals lessons");

    console.log("— dashboard / lessons detail —");
    r = await req("GET", "/api/dashboard", { cookie: teacherCookie });
    ok(r.status === 200 && r.data.stats.plans >= 2, "dashboard stats");
    r = await req("GET", "/api/lessons?q=multiplication", { cookie: teacherCookie });
    ok(r.data.lessons.length >= 1, "find migrated lesson by text");
    const lid = r.data.lessons[0].id;
    r = await req("GET", "/api/lessons/" + lid, { cookie: teacherCookie });
    ok(r.status === 200 && r.data.lesson.unit.includes("Multiplication"), "lesson detail with unit");

    console.log("— RBAC on admin endpoints —");
    r = await req("POST", "/api/teachers", { cookie: teacherCookie, body: { name: "X", email: "x@x.rw" } });
    ok(r.status === 403, "teacher blocked from admin API");
    r = await req("POST", "/api/teachers", { body: { name: "Sneaky", email: "sneaky@school.rw" } });
    ok(r.status === 401, "unauthenticated account creation blocked");

    console.log("— admin —");
    r = await req("POST", "/api/auth/login", { body: { email: "admin@school.rw", password: "changeme123" } });
    const adminCookie = cookieOf(r);
    ok(r.status === 200, "admin login");
    r = await req("GET", "/api/plans", { cookie: adminCookie });
    ok(new Set(r.data.plans.map((p) => p.teacherName)).size >= 2, "admin sees all teachers' plans");

    r = await req("POST", "/api/teachers", { cookie: adminCookie, body: { name: "Test Teacher", email: "test@school.rw", subjects: ["Music"], classes: ["P4"] } });
    ok(r.status === 201, "admin creates teacher (initial password changeme123)");
    const tt = r.data.teacher;
    r = await req("POST", "/api/auth/login", { body: { email: "test@school.rw", password: "changeme123" } });
    ok(r.status === 200 && r.data.user.mustChangePassword === true, "new teacher logs in, must change password");
    r = await req("PUT", "/api/teachers/" + tt.id, { cookie: adminCookie, body: { name: "Test Teacher Edited", email: "test2@school.rw" } });
    ok(r.status === 200 && r.data.teacher.name === "Test Teacher Edited", "admin edits teacher");
    r = await req("PUT", "/api/teachers/" + tt.id, { cookie: adminCookie, body: { email: "jean@school.rw" } });
    ok(r.status === 400, "duplicate email rejected");
    r = await req("PUT", "/api/teachers/" + tt.id, { cookie: teacherCookie, body: { name: "Nope" } });
    ok(r.status === 403, "teacher blocked from editing accounts");
    r = await req("DELETE", "/api/teachers/" + tt.id, { cookie: adminCookie });
    ok(r.status === 200, "admin removes teacher (plans remain)");

    r = await req("POST", "/api/years", { cookie: adminCookie, body: { label: "2027-2028", startDate: "2027-09-06", endDate: "2028-07-07" } });
    ok(r.status === 201, "admin creates year");
    const newYearId = r.data.year.id;
    r = await req("PUT", "/api/years/" + newYearId, { cookie: adminCookie, body: { isActive: true } });
    ok(r.status === 200 && r.data.year.isActive, "admin activates year");
    r = await req("POST", "/api/years", { cookie: teacherCookie, body: { label: "2030-2031", startDate: "2030-09-08", endDate: "2031-07-06" } });
    ok(r.status === 403, "teacher blocked from creating years");

    console.log("— school config —");
    r = await req("PUT", "/api/school/classes", { cookie: adminCookie, body: { levels: ["P1", "P5"], streamsByLevel: { P1: [], P5: ["A", "B"] } } });
    ok(r.status === 200, "school classes config saved");
    r = await req("GET", "/api/meta", { cookie: adminCookie });
    const names = r.data.classes.map((c) => c.name);
    ok(JSON.stringify(names) === JSON.stringify(["P1", "P5A", "P5B"]), "classes rebuilt (P1, P5A, P5B)");
    r = await req("PUT", "/api/school/classes", { cookie: adminCookie, body: { levels: [], streamsByLevel: {} } });
    ok(r.status === 400, "empty levels rejected");
    r = await req("PUT", "/api/school/areas", { cookie: adminCookie, body: { add: "Fine Art" } });
    ok(r.status === 200 && r.data.learningAreas.some((a) => a.name === "Fine Art"), "admin adds learning area");
    r = await req("PUT", "/api/school/areas", { cookie: adminCookie, body: { remove: "Mathematics" } });
    ok(r.status === 409, "area in use cannot be removed");
    r = await req("PUT", "/api/school/info", { cookie: adminCookie, body: { name: "GS Kanyinya", district: "Nyarugenge", sector: "Kanyinya" } });
    ok(r.status === 200, "school info update");

    console.log("— profile & password —");
    r = await req("PUT", "/api/auth/profile", { cookie: teacherCookie, body: { name: "Jean Uwimana (JD)" } });
    ok(r.status === 200 && r.data.user.name === "Jean Uwimana (JD)", "user edits own profile name");
    r = await req("PUT", "/api/auth/profile", { cookie: teacherCookie, body: { name: "" } });
    ok(r.status === 400, "empty profile name rejected");
    r = await req("PUT", "/api/auth/profile", { cookie: teacherCookie, body: { language: "rw" } });
    ok(r.status === 200 && r.data.user.language === "rw", "user language saved (Kinyarwanda)");
    r = await req("PUT", "/api/auth/profile", { cookie: teacherCookie, body: { language: "de" } });
    ok(r.status === 400, "unsupported language rejected");
    r = await req("POST", "/api/auth/password", { cookie: teacherCookie, body: { currentPassword: "changeme123", newPassword: "newpass456" } });
    ok(r.status === 200, "password change");
    r = await req("POST", "/api/auth/login", { body: { email: "jean@school.rw", password: "newpass456" } });
    ok(r.status === 200, "login with new password");
    r = await req("POST", "/api/auth/logout", { cookie: teacherCookie });
    ok(r.status === 200, "logout");

    console.log("— signup flow (fresh install) —");
    r = await req("GET", "/api/auth/signup-status");
    ok(r.status === 200 && r.data.open === false, "signup closed on populated database");
  } finally {
    if (!exited) server.kill();
    try {
      server.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }

  console.log("");
  if (failed) {
    console.error(`SMOKE FAILED: ${failed} check(s) failed, ${passed} passed.`);
    process.exitCode = 1;
  } else {
    console.log(`SMOKE PASSED: ${passed} checks.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* windows may hold the file briefly */
    }
  });
