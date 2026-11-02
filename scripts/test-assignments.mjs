#!/usr/bin/env node
/*
 * End-to-end API check for class-specific teacher assignments.
 *
 *   node scripts/test-assignments.mjs
 *
 * Requires the dev/prod server on http://localhost:3100. Creates a throwaway
 * school, exercises the workflow, then deletes every row it created.
 */

import { PrismaClient } from "@prisma/client";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3100";
const prisma = new PrismaClient();

let cookie = "";
let schoolId = "";
let failures = 0;

function check(condition, label, detail) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const raw of setCookies) {
    const match = raw.match(/slp_session=([^;]+)/);
    if (match) cookie = `slp_session=${match[1]}`;
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

const stamp = Date.now();
const adminEmail = `assignment-admin-${stamp}@example.rw`;
const teacherEmail = `assignment-teacher-${stamp}@example.rw`;
const secondTeacherEmail = `assignment-teacher2-${stamp}@example.rw`;

try {
  console.log("— registration & seed —");
  let r = await req("POST", "/api/auth/register", {
    admin: {
      name: "Assignment Admin",
      email: adminEmail,
      phone: "+250788000000",
      password: "Testpass123",
      passwordConfirm: "Testpass123",
      language: "en",
    },
    school: {
      name: `Assignment Test School ${stamp}`,
      code: `ATS-${stamp}`,
      level: "primary",
      ownership: "private",
      province: "Kigali",
      district: "Gasabo",
      sector: "Remera",
      cell: "Nyabisindu",
      village: "Test",
      address: "Test address",
      officialEmail: "",
      officialPhone: "",
    },
  });
  check(r.status === 201, "register school + admin", r.data);
  schoolId = r.data?.school?.id ?? "";

  r = await req("GET", "/api/school/subjects");
  check(r.status === 200 && r.data.subjects.length >= 8, "default subjects seeded", r.data?.subjects?.length);
  const subjectByName = new Map(r.data.subjects.map((s) => [s.name, s]));
  const sre = subjectByName.get("Social & Religious Studies");
  const set = subjectByName.get("Science & Elementary Technology");
  const math = subjectByName.get("Mathematics");
  const ict = subjectByName.get("ICT");
  check(Boolean(sre && set && math && ict), "seeded subject names available");

  r = await req("PUT", "/api/school/classes", { levels: ["P1", "P2", "P3"] });
  check(r.status === 200 && r.data.school.classes.length === 3, "three classes configured", r.data);
  const classByName = new Map(r.data.school.classes.map((c) => [c.name, c]));

  console.log("— create teacher with class-specific subjects —");
  r = await req("POST", "/api/teachers", {
    name: "Ms. Sonia",
    email: teacherEmail,
    role: "teacher",
    assignments: [
      { classId: classByName.get("P1").id, subjectIds: [sre.id] },
      { classId: classByName.get("P2").id, subjectIds: [sre.id] },
      { classId: classByName.get("P3").id, subjectIds: [set.id] },
    ],
  });
  check(r.status === 201, "teacher created", r.data);
  const teacherId = r.data?.teacher?.id ?? "";
  check((r.data?.teacher?.assignments ?? []).length === 3, "exactly three assignments stored", r.data?.teacher?.assignments);

  r = await req("GET", "/api/meta");
  let teacherMeta = r.data.teachers.find((u) => u.id === teacherId);
  check(Boolean(teacherMeta), "teacher appears in meta");
  const pairKeys = new Set((teacherMeta?.assignments ?? []).map((a) => `${a.className}|${a.subjectName}`));
  check(
    pairKeys.has("P1|Social & Religious Studies") &&
      pairKeys.has("P2|Social & Religious Studies") &&
      pairKeys.has("P3|Science & Elementary Technology"),
    "assignments are per class, not a cross product",
    [...pairKeys]
  );
  check(!pairKeys.has("P3|Social & Religious Studies"), "SET class does not inherit SRE");

  console.log("— second teacher, same classes, different subjects —");
  r = await req("POST", "/api/teachers", {
    name: "Mr. Eric",
    email: secondTeacherEmail,
    role: "teacher",
    assignments: [
      { classId: classByName.get("P1").id, subjectIds: [set.id] },
      { classId: classByName.get("P3").id, subjectIds: [sre.id] },
    ],
  });
  check(r.status === 201, "second teacher created", r.data);
  const secondId = r.data?.teacher?.id ?? "";
  r = await req("GET", "/api/meta");
  const secondMeta = r.data.teachers.find((u) => u.id === secondId);
  const secondKeys = new Set((secondMeta?.assignments ?? []).map((a) => `${a.className}|${a.subjectName}`));
  check(secondKeys.has("P1|Science & Elementary Technology"), "second teacher P1 SET");
  check(secondKeys.has("P3|Social & Religious Studies"), "second teacher P3 SRE");
  const firstStill = r.data.teachers.find((u) => u.id === teacherId);
  const firstKeys = new Set((firstStill?.assignments ?? []).map((a) => `${a.className}|${a.subjectName}`));
  check(
    firstKeys.has("P1|Social & Religious Studies") && firstKeys.has("P3|Science & Elementary Technology"),
    "first teacher's assignments untouched by the second teacher",
    [...firstKeys]
  );

  console.log("— login as teacher & enforce planner rules —");
  cookie = "";
  r = await req("POST", "/api/auth/login", { email: teacherEmail, password: "changeme123" });
  check(r.status === 200, "teacher login", r.data);

  const metaNow = (await req("GET", "/api/meta")).data;
  const activeYearId = metaNow.activeYear.id;
  const activeYearInfo = metaNow.years.find((y) => y.id === activeYearId);
  const date = activeYearInfo?.startDate
    ? new Date(Date.parse(activeYearInfo.startDate) + 30 * 86400000).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const row = (cls, subject) => ({
    time: "08:00-08:40",
    classId: cls.id,
    className: cls.name,
    learningAreaId: subject.id,
    learningArea: subject.name,
    subUnit: "1.1",
    competence: "Test competence",
    procedure: "Test procedure",
  });

  r = await req("POST", "/api/plans", {
    date,
    term: 1,
    academicYearId: activeYearId,
    rows: [row(classByName.get("P3"), sre)],
  });
  check(r.status === 400, "teacher blocked from unassigned subject in P3", r.data);

  r = await req("POST", "/api/plans", {
    date,
    term: 1,
    academicYearId: activeYearId,
    rows: [row(classByName.get("P3"), set)],
  });
  check(r.status === 201, "teacher can plan P3 SET", r.data);
  const p3PlanId = r.data?.plan?.id;

  r = await req("POST", "/api/plans", {
    date,
    term: 1,
    academicYearId: activeYearId,
    rows: [row(classByName.get("P1"), sre), row(classByName.get("P2"), sre)],
  });
  check(r.status === 201, "teacher can plan P1 + P2 SRE", r.data);
  const multiPlanId = r.data?.plan?.id;

  // Changing the class must also change the allowed subject set.
  r = await req("PUT", `/api/plans/${p3PlanId}`, {
    date,
    term: 1,
    academicYearId: activeYearId,
    rows: [row(classByName.get("P1"), set)],
  });
  check(r.status === 400, "teacher blocked from teaching SET in P1", r.data);

  // Admin may plan any class/subject combination in the school.
  cookie = "";
  r = await req("POST", "/api/auth/login", { email: adminEmail, password: "Testpass123" });
  check(r.status === 200, "admin login", r.data);
  r = await req("POST", "/api/plans", {
    date,
    term: 1,
    academicYearId: activeYearId,
    rows: [row(classByName.get("P2"), set)],
  });
  check(r.status === 201, "admin can plan any class + subject", r.data);

  console.log("— duplicating a shared plan respects assignments —");
  cookie = "";
  r = await req("POST", "/api/auth/login", { email: secondTeacherEmail, password: "changeme123" });
  check(r.status === 200, "second teacher login", r.data);
  r = await req("POST", `/api/plans/${p3PlanId}/duplicate`, { date, term: 1, academicYearId: activeYearId });
  check(r.status === 400, "teacher cannot duplicate rows they are not assigned", r.data);

  cookie = "";
  r = await req("POST", "/api/auth/login", { email: adminEmail, password: "Testpass123" });
  check(r.status === 200, "admin login again", r.data);
  r = await req("POST", `/api/plans/${p3PlanId}/duplicate`, { date, term: 1, academicYearId: activeYearId });
  check(r.status === 201, "admin can duplicate any plan", r.data);

  console.log("— editing assignments leaves unrelated pairs intact —");
  r = await req("PUT", `/api/teachers/${teacherId}`, {
    assignments: [
      { classId: classByName.get("P1").id, subjectIds: [sre.id] },
      { classId: classByName.get("P2").id, subjectIds: [sre.id] },
      { classId: classByName.get("P3").id, subjectIds: [set.id, math.id, set.id] },
    ],
  });
  check(r.status === 200, "assignments updated", r.data);
  const updated = r.data?.teacher?.assignments ?? [];
  const perClass = {};
  for (const a of updated) perClass[a.className] = (perClass[a.className] ?? 0) + 1;
  check(perClass.P1 === 1 && perClass.P2 === 1, "P1/P2 untouched", perClass);
  check(perClass.P3 === 2, "P3 gained exactly one subject (duplicates collapsed)", perClass);

  r = await req("PUT", `/api/teachers/${teacherId}`, {
    assignments: [{ classId: "class_from_another_school", subjectIds: [sre.id] }],
  });
  check(r.status === 400, "foreign class id rejected", r.data);
  const afterReject = (await req("GET", "/api/meta")).data.teachers.find((u) => u.id === teacherId);
  check((afterReject?.assignments ?? []).length === 4, "rejected edit did not wipe assignments", afterReject?.assignments?.length);

  console.log("— subject rename / delete protection —");
  r = await req("PUT", `/api/school/subjects/${sre.id}`, { name: "Social & Religious Studies (SRE)" });
  check(r.status === 200, "subject renamed", r.data);
  r = await req("GET", "/api/meta");
  teacherMeta = r.data.teachers.find((u) => u.id === teacherId);
  check(
    (teacherMeta?.assignments ?? []).some((a) => a.subjectName === "Social & Religious Studies (SRE)"),
    "rename keeps existing assignments"
  );
  r = await req("GET", `/api/plans/${multiPlanId}`);
  check(
    (r.data?.plan?.rows ?? []).every((x) => !x.learningAreaId || x.learningArea === "Social & Religious Studies (SRE)"),
    "rename updates saved plan labels",
    r.data?.plan?.rows?.map((x) => x.learningArea)
  );

  r = await req("DELETE", `/api/school/subjects/${sre.id}`);
  check(r.status === 409, "used subject cannot be deleted", r.data);
  r = await req("DELETE", `/api/school/subjects/${ict.id}`);
  check(r.status === 200, "unused subject can be deleted", r.data);
  r = await req("POST", "/api/school/subjects", { name: "Kiswahili" });
  check(r.status === 200 && r.data.subjects.some((s) => s.name === "Kiswahili"), "new subject appears immediately", r.data);
  const kiswahili = r.data.subjects.find((s) => s.name === "Kiswahili");
  r = await req("DELETE", `/api/school/subjects/${kiswahili.id}`);
  check(r.status === 200, "new subject can be removed", r.data);

  console.log(failures === 0 ? "\nAll assignment checks passed." : `\n${failures} check(s) failed.`);
  if (failures) process.exitCode = 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  // Clean up the throwaway school so the real database is untouched.
  if (schoolId) {
    try {
      await prisma.lesson.deleteMany({ where: { schoolId } });
      await prisma.plan.deleteMany({ where: { schoolId } });
      await prisma.teachingAssignment.deleteMany({ where: { schoolId } });
      await prisma.session.deleteMany({ where: { user: { schoolId } } });
      await prisma.user.deleteMany({ where: { schoolId } });
      await prisma.class.deleteMany({ where: { schoolId } });
      await prisma.subject.deleteMany({ where: { schoolId } });
      await prisma.learningArea.deleteMany({ where: { schoolId } });
      await prisma.academicYear.deleteMany({ where: { schoolId } });
      await prisma.school.delete({ where: { id: schoolId } });
      console.log("Test school removed.");
    } catch (error) {
      console.error("Cleanup failed:", error);
    }
  }
  await prisma.$disconnect();
}
