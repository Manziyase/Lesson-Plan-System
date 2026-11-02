#!/usr/bin/env node
/*
 * End-to-end smoke test for the Super Admin platform console.
 *
 *   npm run test:superadmin
 *
 * Requires a dev/prod server on http://localhost:3100 (override TEST_BASE_URL).
 * It creates its own throwaway PlatformAdmin, schools, users, subscription,
 * payment and announcement, exercises the real HTTP API, restores every
 * platform setting it changes, then deletes everything it created.
 */

import crypto from "node:crypto";
import process from "node:process";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3100";
const prisma = new PrismaClient();

let failures = 0;
let checks = 0;
const stamp = Date.now();

const adminEmail = `sa-test-${stamp}@example.rw`;
const adminPassword = "SuperTest123";
const schoolAEmail = `sa-school-a-${stamp}@example.rw`;
const schoolBEmail = `sa-school-b-${stamp}@example.rw`;
const schoolCEmail = `sa-school-c-${stamp}@example.rw`;
const teacherEmail = `sa-teacher-${stamp}@example.rw`;
const schoolPassword = "SchoolTest123";

let platformCookie = "";
let schoolACookie = "";
let schoolBCookie = "";
let schoolCCookie = "";

function check(condition, label, detail) {
  checks += 1;
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

async function call(method, path, body, cookieHeader = "") {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data, setCookies };
}

function pickCookie(setCookies, name) {
  for (const raw of setCookies) {
    const match = raw.match(new RegExp(`${name}=([^;]+)`));
    if (match) return `${name}=${match[1]}`;
  }
  return "";
}

async function superLogin() {
  const r = await call("POST", "/api/superadmin/auth/login", {
    email: adminEmail,
    password: adminPassword,
  });
  platformCookie = pickCookie(r.setCookies, "slp_platform_session") || platformCookie;
  return r;
}

async function schoolLogin(email) {
  const r = await call("POST", "/api/auth/login", { email, password: schoolPassword });
  return { ...r, cookie: pickCookie(r.setCookies, "slp_session") };
}

function registerPayload(email, name, schoolName, code) {
  return {
    admin: {
      name,
      email,
      phone: "+250788000111",
      password: schoolPassword,
      passwordConfirm: schoolPassword,
      language: "en",
    },
    school: {
      name: schoolName,
      code,
      level: "primary",
      ownership: "private",
      province: "Kigali",
      district: "Gasabo",
      sector: "Remera",
      cell: "Nyabisindu",
      village: "Test",
      address: "Smoke test address",
      officialEmail: "",
      officialPhone: "",
    },
  };
}

async function registerSchool(email, name, schoolName, code) {
  const r = await call("POST", "/api/auth/register", registerPayload(email, name, schoolName, code));
  return { ...r, cookie: pickCookie(r.setCookies, "slp_session") };
}

function hashPassword(password, salt = crypto.randomBytes(12).toString("hex")) {
  return { salt, hash: crypto.scryptSync(String(password), salt, 32).toString("hex") };
}

let adminId = "";
const createdSchoolIds = [];

async function cleanup(originalSettings) {
  try {
    if (originalSettings) {
      await call(
        "PUT",
        "/api/superadmin/settings",
        {
          registration: originalSettings.registration,
          subscriptions: originalSettings.subscriptions,
          features: originalSettings.features,
          maintenance: originalSettings.maintenance,
        },
        platformCookie
      );
    }
  } catch {
    /* best effort */
  }
  try {
    await prisma.announcement.deleteMany({ where: { title: { startsWith: "Smoke test" } } });
    if (createdSchoolIds.length) {
      const schools = { in: createdSchoolIds };
      await prisma.announcementSchool.deleteMany({ where: { schoolId: schools } });
      await prisma.auditLog.deleteMany({
        where: { OR: [{ schoolId: schools }, { actorEmail: adminEmail }] },
      });
      // Schools are protected by RESTRICT on users/years/plans, so remove
      // tenant-owned rows explicitly (child rows cascade from these).
      await prisma.plan.deleteMany({ where: { schoolId: schools } });
      await prisma.academicYear.deleteMany({ where: { schoolId: schools } });
      await prisma.user.deleteMany({ where: { schoolId: schools } });
      await prisma.school.deleteMany({ where: { id: schools } });
    }
    await prisma.recoveryToken.deleteMany({ where: { user: { email: teacherEmail } } });
    if (adminId) await prisma.platformAdmin.deleteMany({ where: { id: adminId } });
  } catch (err) {
    console.error(`  ⚠ cleanup issue: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main() {
  /* ---------------- setup: platform admin ---------------- */
  const { salt, hash } = hashPassword(adminPassword);
  const admin = await prisma.platformAdmin.create({
    data: {
      id: "padmin_test_" + crypto.randomUUID().slice(0, 8),
      name: "Smoke Test Super Admin",
      email: adminEmail,
      salt,
      passwordHash: hash,
      status: "active",
      mustChangePassword: false,
    },
  });
  adminId = admin.id;

  let originalSettings = null;

  try {
    console.log("— authentication separation —");
    let r = await superLogin();
    check(r.status === 200 && platformCookie, "super admin login issues a platform cookie", r.data);
    check(r.data?.mfaRequired === false, "non-MFA login completes without a challenge");

    r = await call("GET", "/api/superadmin/auth/me", undefined, platformCookie);
    check(r.status === 200 && r.data?.admin?.email === adminEmail, "platform /me returns the super admin");

    r = await call("GET", "/api/superadmin/overview", undefined, platformCookie);
    check(r.status === 200 && r.data?.stats, "overview returns database-backed stats", r.data);
    check(typeof r.data?.stats?.schoolsTotal === "number", "schoolsTotal is a number");
    check(typeof r.data?.stats?.usersTotal === "number", "usersTotal is a number");
    check(Array.isArray(r.data?.trends?.schools?.series), "school trend series exists");
    check(Array.isArray(r.data?.trends?.activity), "activity series exists");

    /* ---------------- settings snapshot ---------------- */
    r = await call("GET", "/api/superadmin/settings", undefined, platformCookie);
    check(r.status === 200 && r.data?.settings, "settings load");
    originalSettings = r.data.settings;
    check(originalSettings?.features, "feature flags present");
    check(r.data?.secretsConfigured !== undefined, "secret status exposes presence only");

    /* ---------------- schools registration ---------------- */
    console.log("— schools & tenant isolation —");
    const schoolA = await registerSchool(schoolAEmail, "School A Admin", `Smoke Test School A ${stamp}`, `SA-${stamp}`);
    check(schoolA.status === 201 && schoolA.cookie, "school A registers and signs in", schoolA.data);
    const schoolAId = schoolA.data?.school?.id;
    if (schoolAId) createdSchoolIds.push(schoolAId);
    schoolACookie = schoolA.cookie;

    const schoolB = await registerSchool(schoolBEmail, "School B Admin", `Smoke Test School B ${stamp}`, `SB-${stamp}`);
    check(schoolB.status === 201 && schoolB.cookie, "school B registers and signs in", schoolB.data);
    const schoolBId = schoolB.data?.school?.id;
    if (schoolBId) createdSchoolIds.push(schoolBId);
    schoolBCookie = schoolB.cookie;

    const teacher = await call(
      "POST",
      "/api/teachers",
      { name: "Smoke Test Teacher", email: teacherEmail, role: "teacher", subjects: [], classes: [] },
      schoolACookie
    );
    check(teacher.status === 201 || teacher.status === 200, "school admin creates a teacher", teacher.data);
    const teacherId = teacher.data?.teacher?.id || teacher.data?.user?.id;

    r = await call("GET", "/api/superadmin/overview", undefined, schoolACookie);
    check(r.status === 401, "school session cannot access platform overview");

    r = await call("GET", `/api/superadmin/schools/${schoolBId}`, undefined, schoolACookie);
    check(r.status === 401, "school session cannot open another school's profile");

    r = await call("GET", "/api/superadmin/users", undefined, schoolACookie);
    check(r.status === 401, "school session cannot list platform users");

    r = await call("GET", "/api/auth/me", undefined, platformCookie);
    check(r.status === 401, "platform session cannot act as a school user");

    r = await call("POST", "/api/superadmin/auth/login", {
      email: schoolAEmail,
      password: schoolPassword,
    });
    check(r.status === 401, "a school account cannot log into the platform console");

    r = await call("GET", "/api/superadmin/schools?q=Smoke%20Test", undefined, platformCookie);
    check(r.status === 200 && Array.isArray(r.data?.schools), "schools list supports search");
    check((r.data?.schools ?? []).some((s) => s.id === schoolAId), "new school appears in the platform list");

    r = await call("GET", `/api/superadmin/schools/${schoolAId}`, undefined, platformCookie);
    check(r.status === 200 && r.data?.school?.id === schoolAId, "school profile detail");
    check(r.data?.counts && typeof r.data.counts.teachers === "number", "school detail has tenant counts");

    r = await call("GET", `/api/superadmin/users?q=${encodeURIComponent(teacherEmail)}`, undefined, platformCookie);
    check(r.status === 200 && r.data?.users?.some((u) => u.email === teacherEmail), "cross-school user search");

    /* ---------------- feature gating ---------------- */
    console.log("— platform features & maintenance —");
    r = await call(
      "PUT",
      "/api/superadmin/settings",
      { features: { ...originalSettings.features, planner: false } },
      platformCookie
    );
    check(r.status === 200 && r.data?.settings?.features?.planner === false, "planner feature can be disabled");

    r = await call("POST", "/api/plans", {}, schoolACookie);
    check(r.status === 403, "planner API is enforced server-side when disabled", r.data);

    r = await call(
      "PUT",
      "/api/superadmin/settings",
      { features: originalSettings.features },
      platformCookie
    );
    check(r.status === 200 && r.data?.settings?.features?.planner === originalSettings.features.planner, "planner restored");

    r = await call(
      "PUT",
      "/api/superadmin/settings",
      { maintenance: { enabled: true, message: "Smoke test maintenance" } },
      platformCookie
    );
    check(r.status === 200, "maintenance mode can be enabled");

    r = await call("POST", "/api/auth/login", { email: schoolAEmail, password: schoolPassword });
    check(r.status === 503, "maintenance blocks school sign-in", r.data);

    r = await call("GET", "/api/auth/me", undefined, schoolACookie);
    check(r.status === 401, "maintenance refuses active school sessions");

    r = await call("GET", "/api/superadmin/overview", undefined, platformCookie);
    check(r.status === 200, "super admins keep access during maintenance");

    r = await call(
      "PUT",
      "/api/superadmin/settings",
      { maintenance: originalSettings.maintenance },
      platformCookie
    );
    check(r.status === 200, "maintenance mode restored");

    r = await schoolLogin(schoolAEmail);
    check(r.status === 200 && r.cookie, "school sign-in works again after maintenance");
    schoolACookie = r.cookie || schoolACookie;

    /* ---------------- suspension ---------------- */
    console.log("— school suspension & reactivation —");
    r = await call(
      "POST",
      `/api/superadmin/schools/${schoolAId}/status`,
      { status: "suspended", reason: "Smoke test suspension" },
      platformCookie
    );
    check(r.status === 200 && r.data?.status === "suspended", "school can be suspended", r.data);

    r = await call("GET", "/api/auth/me", undefined, schoolACookie);
    check(r.status === 401, "suspension revokes tenant sessions");

    r = await schoolLogin(schoolAEmail);
    check(r.status === 403, "suspended school cannot sign in");

    r = await call(
      "POST",
      `/api/superadmin/schools/${schoolAId}/status`,
      { status: "active" },
      platformCookie
    );
    check(r.status === 200 && r.data?.status === "active", "school can be reactivated", r.data);

    r = await schoolLogin(schoolAEmail);
    check(r.status === 200 && r.cookie, "reactivated school can sign in");
    schoolACookie = r.cookie || schoolACookie;

    /* ---------------- user disable & recovery ---------------- */
    console.log("— user management & recovery —");
    if (!teacherId) {
      check(false, "teacher id available for disable test", teacher.data);
    } else {
      r = await call(
        "PATCH",
        `/api/superadmin/users/${teacherId}`,
        { status: "disabled", reason: "Smoke test disable" },
        platformCookie
      );
      check(r.status === 200 && r.data?.user?.status === "disabled", "user can be disabled", r.data);

      r = await call("POST", "/api/auth/login", { email: teacherEmail, password: "changeme123" });
      check(r.status === 403, "disabled user cannot sign in");

      r = await call(
        "PATCH",
        `/api/superadmin/users/${teacherId}`,
        { status: "active" },
        platformCookie
      );
      check(r.status === 200 && r.data?.user?.status === "active", "user can be reactivated", r.data);

      r = await call(
        "POST",
        `/api/superadmin/users/${teacherId}/recovery`,
        {},
        platformCookie
      );
      check(r.status === 200 && r.data?.token, "one-time recovery link issued", r.data);
      const recoveryToken = r.data?.token;

      if (recoveryToken) {
        r = await call("GET", `/api/auth/recovery?token=${encodeURIComponent(recoveryToken)}`);
        check(r.status === 200 && r.data?.valid === true, "recovery link validates", r.data);

        r = await call("POST", "/api/auth/recovery", {
          token: recoveryToken,
          password: "Recovered123",
          passwordConfirm: "Recovered123",
        });
        check(r.status === 200 && r.data?.ok === true, "recovery link can set a new password", r.data);

        r = await call("GET", `/api/auth/recovery?token=${encodeURIComponent(recoveryToken)}`);
        check(r.status === 400 || r.data?.valid === false, "recovery link is single-use");

        r = await call("POST", "/api/auth/login", { email: teacherEmail, password: "Recovered123" });
        check(r.status === 200, "user signs in with the recovered password", r.data);
      }
    }

    /* ---------------- subscriptions & payments ---------------- */
    console.log("— subscriptions, plans & payments —");
    r = await call("GET", "/api/superadmin/plans", undefined, platformCookie);
    check(r.status === 200 && Array.isArray(r.data?.plans) && r.data.plans.length >= 4, "default plans exist");
    const freePlan = r.data.plans.find((p) => p.code === "free");

    r = await call(
      "POST",
      "/api/superadmin/subscriptions",
      { schoolId: schoolBId, planId: freePlan?.id, status: "active", billingCycle: "annual", notes: "Smoke test" },
      platformCookie
    );
    check(r.status === 201 && r.data?.subscription?.status === "active", "subscription can be assigned", r.data);
    const subscriptionId = r.data?.subscription?.id;

    r = await call(
      "POST",
      "/api/superadmin/payments",
      {
        schoolId: schoolBId,
        subscriptionId,
        amount: 12345,
        currency: "RWF",
        status: "paid",
        method: "bank_transfer",
        reference: `SMOKE-${stamp}`,
      },
      platformCookie
    );
    check(r.status === 201 && r.data?.payment?.status === "paid", "manual payment record created", r.data);

    r = await call("GET", `/api/superadmin/payments?q=SMOKE-${stamp}`, undefined, platformCookie);
    check(r.status === 200 && r.data?.total >= 1, "payment appears in billing records");
    check((r.data?.summary?.totalPaid ?? 0) >= 12345, "revenue uses paid records only");

    r = await call("GET", `/api/superadmin/subscriptions?schoolId=${schoolBId}`, undefined, platformCookie);
    check(r.status === 200 && r.data?.subscriptions !== undefined, "subscription history is queryable");

    /* ---------------- announcements ---------------- */
    console.log("— platform announcements —");
    r = await call(
      "POST",
      "/api/superadmin/announcements",
      {
        title: `Smoke test announcement ${stamp}`,
        message: "This is a real recipient-visibility test.",
        audience: "schools",
        schoolIds: [schoolAId],
        status: "published",
      },
      platformCookie
    );
    check(r.status === 201 && r.data?.announcement?.status === "published", "announcement published to selected school", r.data);
    const announcementId = r.data?.announcement?.id;

    r = await call("GET", "/api/announcements", undefined, schoolACookie);
    check(
      r.status === 200 && (r.data?.announcements ?? []).some((a) => a.id === announcementId),
      "targeted school receives the announcement"
    );

    r = await call("GET", "/api/announcements", undefined, schoolBCookie);
    check(
      r.status === 200 && !(r.data?.announcements ?? []).some((a) => a.id === announcementId),
      "other schools do not receive a targeted announcement"
    );

    r = await call("DELETE", `/api/superadmin/announcements/${announcementId}`, undefined, platformCookie);
    check(r.status === 200, "announcement can be deleted", r.data);

    /* ---------------- pending approval flow ---------------- */
    console.log("— registration approval flow —");
    r = await call(
      "PUT",
      "/api/superadmin/settings",
      { registration: { ...originalSettings.registration, requireAdminApproval: true } },
      platformCookie
    );
    check(r.status === 200, "require approval can be enabled");

    const schoolC = await registerSchool(schoolCEmail, "School C Admin", `Smoke Test School C ${stamp}`, `SC-${stamp}`);
    check(schoolC.status === 201 && schoolC.data?.pendingApproval === true, "registration returns pendingApproval", schoolC.data);
    check(!schoolC.cookie, "pending registration does not create a school session");
    const schoolCId = schoolC.data?.school?.id;
    if (schoolCId) createdSchoolIds.push(schoolCId);
    schoolCCookie = schoolC.cookie;

    if (schoolCId) {
      const pendingSubs = await prisma.schoolSubscription.count({ where: { schoolId: schoolCId } });
      check(pendingSubs === 0, "pending school receives no subscription");

      r = await call("POST", "/api/auth/login", { email: schoolCEmail, password: schoolPassword });
      check(r.status === 403, "pending school cannot sign in");

      r = await call(
        "POST",
        `/api/superadmin/schools/${schoolCId}/status`,
        { status: "active" },
        platformCookie
      );
      check(r.status === 200 && r.data?.status === "active", "super admin approves pending school", r.data);

      const approvedSubs = await prisma.schoolSubscription.count({ where: { schoolId: schoolCId } });
      check(approvedSubs >= 1, "approval assigns the default subscription");

      const schoolCAfter = await schoolLogin(schoolCEmail);
      check(schoolCAfter.status === 200 && schoolCAfter.cookie, "approved school can sign in");
      schoolCCookie = schoolCAfter.cookie || schoolCCookie;
    }

    r = await call(
      "PUT",
      "/api/superadmin/settings",
      { registration: originalSettings.registration },
      platformCookie
    );
    check(r.status === 200, "registration settings restored");

    /* ---------------- logs & monitoring ---------------- */
    console.log("— audit logs & monitoring —");
    r = await call("GET", "/api/superadmin/logs?pageSize=50", undefined, platformCookie);
    check(r.status === 200 && Array.isArray(r.data?.logs) && r.data.logs.length > 0, "audit logs are populated");
    const actions = (r.data?.logs ?? []).map((l) => l.action);
    check(actions.includes("school.suspend"), "school suspension is audited");
    check(actions.includes("user.disable"), "user disablement is audited");
    check(actions.includes("platform.settings_updated"), "settings changes are audited");

    r = await call("GET", "/api/superadmin/monitoring", undefined, platformCookie);
    check(r.status === 200, "monitoring endpoint responds", r.data);
    check(r.data?.health !== undefined || r.data?.system !== undefined || r.data?.database !== undefined, "monitoring reports health/database state");

    console.log(`\n${checks - failures}/${checks} checks passed.`);
    process.exitCode = failures ? 1 : 0;
  } finally {
    await cleanup(originalSettings);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
