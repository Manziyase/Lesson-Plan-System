import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/session";
import { str, EMAIL_RE } from "@/lib/util";
import { isSupportedLang } from "@/lib/i18n";
import { throttleCheck, throttleRecord } from "@/lib/throttle";
import { getPlatformSettings, assignDefaultSubscription } from "@/lib/platform";
import { audit, requestMeta } from "@/lib/audit";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  isSchoolLevel,
  isOwnership,
  isPhone,
  isStrongPassword,
  emailTaken,
  schoolAlreadyRegistered,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

const DEFAULT_AREAS = [
  "Mathematics",
  "English",
  "Kinyarwanda",
  "Science & Elementary Technology",
  "Social & Religious Studies",
  "Entrepreneurship",
  "ICT",
  "Physical Education & Sports",
];

/**
 * School Admin Registration — creates a NEW school workspace and its
 * School Administrator. Unlike the legacy first-run /signup, this stays
 * open: every registration is a separate school, so the checks are about
 * duplicate accounts/schools rather than "installation is empty".
 *
 * Security: per-IP throttling, full server-side validation (with the
 * password match re-checked here), case-insensitive duplicate email and
 * duplicate-school detection, scrypt password hashing and opaque HttpOnly
 * session tokens reused from the shared session module.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const reqMeta = requestMeta(req);
  const platformSettings = await getPlatformSettings();
  if (platformSettings.maintenance.enabled) {
    return Response.json(
      {
        error:
          platformSettings.maintenance.message ||
          "LessonHub is temporarily in maintenance mode. Please try again shortly.",
      },
      { status: 503 }
    );
  }
  if (!platformSettings.registration.enabled) {
    return Response.json(
      { error: "New school registration is temporarily closed. Please contact LessonHub support." },
      { status: 403 }
    );
  }
  const requireApproval = platformSettings.registration.requireAdminApproval;
  if (!throttleCheck(ip)) {
    return Response.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  const admin = (body.admin as Record<string, unknown>) || {};
  const schoolIn = (body.school as Record<string, unknown>) || {};

  /* ---------- administrator ---------- */
  const name = str(admin.name);
  const email = str(admin.email).toLowerCase();
  const phone = str(admin.phone);
  const password = typeof admin.password === "string" ? admin.password : "";
  const passwordConfirm = typeof admin.passwordConfirm === "string" ? admin.passwordConfirm : "";
  const language = isSupportedLang(admin.language) ? admin.language : "en";

  /* ---------- school ---------- */
  const schoolName = str(schoolIn.name);
  const code = str(schoolIn.code);
  const level = isSchoolLevel(schoolIn.level) ? schoolIn.level : "";
  const ownership = isOwnership(schoolIn.ownership) ? schoolIn.ownership : "";
  const province = str(schoolIn.province);
  const district = str(schoolIn.district);
  const sector = str(schoolIn.sector);
  const cell = str(schoolIn.cell);
  const village = str(schoolIn.village);
  const address = str(schoolIn.address);
  const officialEmail = str(schoolIn.officialEmail).toLowerCase();
  const officialPhone = str(schoolIn.officialPhone);

  const errors: string[] = [];

  // Administrator details (all required per spec)
  if (!name) errors.push("Your full name is required.");
  if (name.length > 80) errors.push("Your name is too long (max 80 characters).");
  if (!email) errors.push("Your email address is required.");
  else if (!EMAIL_RE.test(email)) errors.push("Please enter a valid email address.");
  else {
    const domains = (platformSettings.registration.allowedEmailDomains || [])
      .map((d) => String(d).trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean);
    const domain = email.split("@")[1] || "";
    if (domains.length && !domains.includes(domain)) {
      errors.push(
        `Registration is limited to these email domains: ${domains.map((d) => "@" + d).join(", ")}.`
      );
    }
  }
  if (!phone) errors.push("Your phone number is required.");
  else if (!isPhone(phone)) errors.push("Please enter a valid phone number (e.g. +250 788 000 000).");
  if (!password) errors.push("A password is required.");
  else if (!isStrongPassword(password)) errors.push("Password must be at least 8 characters and include a letter and a number.");
  if (password && passwordConfirm !== password) errors.push("Passwords do not match.");

  // School details (name required; the rest per spec)
  if (!schoolName) errors.push("School name is required.");
  if (schoolName.length > 120) errors.push("School name is too long (max 120 characters).");
  if (!level) errors.push("Please choose the school level.");
  if (!ownership) errors.push("Please choose the ownership type.");
  for (const [label, v, max] of [
    ["Province", province, 40],
    ["District", district, 60],
    ["Sector", sector, 60],
    ["Cell", cell, 60],
    ["Village", village, 60],
    ["Physical address", address, 160],
  ] as const) {
    if (v.length > max) errors.push(`${label} is too long (max ${max} characters).`);
  }
  if (officialEmail && !EMAIL_RE.test(officialEmail)) errors.push("Please enter a valid official school email.");
  if (officialPhone && !isPhone(officialPhone)) errors.push("Please enter a valid official school phone number.");

  // Uniqueness
  if (email && (await emailTaken(email))) errors.push("An account with this email already exists. Please sign in instead.");
  if (schoolName) {
    const dup = await schoolAlreadyRegistered(schoolName, district, code);
    if (dup) errors.push(dup);
  }

  if (errors.length) {
    return Response.json({ error: errors[0], errors }, { status: 400 });
  }

  /* ---------- create the school workspace ---------- */
  const school = await prisma.school.create({
    data: {
      id: "school_" + crypto.randomUUID().slice(0, 8),
      name: schoolName.slice(0, 120),
      code: code.slice(0, 40),
      level,
      ownership,
      province: province.slice(0, 40),
      district: district.slice(0, 60),
      sector: sector.slice(0, 60),
      cell: cell.slice(0, 60),
      village: village.slice(0, 60),
      address: address.slice(0, 160),
      officialEmail: officialEmail.slice(0, 120),
      officialPhone: officialPhone.slice(0, 30),
      levels: JSON.stringify([]),
      status: requireApproval ? "pending" : "active",
      statusReason: requireApproval ? "Awaiting super admin approval" : "",
      statusChangedAt: requireApproval ? new Date() : null,
    },
  });

  // Sensible starting data so planning works immediately.
  await prisma.learningArea.createMany({
    data: DEFAULT_AREAS.map((n) => ({
      schoolId: school.id,
      name: n,
      id: ("a-" + n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 14) + "-" + crypto.randomUUID().slice(0, 4)),
    })),
  });
  // Subjects power teacher assignments and the planner's learning-area list.
  await prisma.subject.createMany({
    data: DEFAULT_AREAS.map((n) => ({
      schoolId: school.id,
      name: n,
      id: ("s-" + n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 14) + "-" + crypto.randomUUID().slice(0, 4)),
    })),
  });

  const nw = new Date().getUTCFullYear();
  const startYear = new Date().getUTCMonth() >= 7 ? nw : nw - 1; // Rwandan school year starts in September
  const year = await prisma.academicYear.create({
    data: {
      id: "year_" + crypto.randomUUID().slice(0, 8),
      schoolId: school.id,
      label: `${startYear}-${startYear + 1}`,
      startDate: `${startYear}-09-08`,
      endDate: `${startYear + 1}-07-03`,
      terms: JSON.stringify([1, 2, 3]),
      isActive: true,
    },
  });

  /* ---------- create the administrator ---------- */
  const { salt, hash } = hashPassword(password);
  const user = await prisma.user.create({
    data: {
      id: "user_" + crypto.randomUUID().slice(0, 8),
      schoolId: school.id,
      name: name.slice(0, 80),
      email,
      phone: phone.slice(0, 30),
      role: "admin", // School Administrator
      salt,
      passwordHash: hash,
      language,
      mustChangePassword: false,
      activeYearId: year.id,
    },
  });

  throttleRecord(ip, true);

  /* Default plan assignment only when the workspace is immediately usable.
     Pending registrations receive their trial when a super admin approves. */
  if (!requireApproval) {
    await assignDefaultSubscription(school.id, { name: user.name, email: user.email });
  }

  await audit({
    actorType: "school_user",
    actorId: user.id,
    actorName: user.name,
    actorEmail: user.email,
    action: requireApproval ? "school.registration_pending" : "school.registered",
    targetType: "school",
    targetId: school.id,
    schoolId: school.id,
    summary: requireApproval
      ? `New school awaiting approval: ${school.name}`
      : `New school registered: ${school.name}`,
    ip: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    metadata: {
      schoolCode: school.code,
      level: school.level,
      ownership: school.ownership,
      district: school.district,
      approvalRequired: requireApproval,
    },
  });

  if (requireApproval) {
    return NextResponse.json(
      {
        pendingApproval: true,
        message:
          "Your registration was received. A platform administrator must approve this school before you can sign in.",
        school: { id: school.id, name: school.name, status: school.status },
      },
      { status: 201 }
    );
  }

  const token = await createSession(user.id);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.json(
    {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: "admin",
        schoolId: school.id,
        subjects: [],
        classes: [],
        language: user.language,
        mustChangePassword: false,
        createdAt: user.createdAt,
      },
      school: { id: school.id, name: school.name },
    },
    { status: 201 }
  );
}
