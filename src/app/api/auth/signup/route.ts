import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createSession, SESSION_COOKIE, SESSION_TTL_SECONDS, publicUser } from "@/lib/session";
import { str, EMAIL_RE } from "@/lib/util";
import { isSupportedLang } from "@/lib/i18n";
import { throttleCheck, throttleRecord } from "@/lib/throttle";
import { getPlatformSettings, assignDefaultSubscription } from "@/lib/platform";
import { audit, requestMeta } from "@/lib/audit";
import { cookies } from "next/headers";

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
 * First-run signup for a school's administrator. Only allowed while the
 * installation has no school (mirrors the legacy endpoint). Creates the
 * school record, the admin account and a default academic year so planning
 * works immediately.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const reqMeta = requestMeta(req);
  const platformSettings = await getPlatformSettings();
  if (!platformSettings.registration.enabled) {
    return Response.json(
      { error: "New school registration is temporarily closed. Please contact LessonHub support." },
      { status: 403 }
    );
  }
  if (!throttleCheck(ip)) {
    return Response.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  }
  if ((await prisma.school.count()) > 0) {
    return Response.json({ error: "Signup is closed: a school is already registered on this installation." }, { status: 403 });
  }
  if ((await prisma.user.count({ where: { role: "admin" } })) > 0) {
    return Response.json({ error: "Signup is closed: an administrator already exists." }, { status: 403 });
  }

  let body: { admin?: Record<string, unknown>; school?: Record<string, unknown> } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const admin = body.admin || {};
  const schoolIn = body.school || {};

  /* ----- validate admin ----- */
  const name = str(admin.name);
  const email = str(admin.email).toLowerCase();
  const password = typeof admin.password === "string" ? admin.password : "";
  const language = isSupportedLang(admin.language) ? admin.language : "en";
  const errors: string[] = [];
  if (!name) errors.push("Your full name is required.");
  if (!EMAIL_RE.test(email)) errors.push("A valid email address is required.");
  if (email && (await prisma.user.findFirst({ where: { email } }))) errors.push("An account with this email already exists.");
  if (!password || password.length < 6) errors.push("Password must be at least 6 characters.");
  if (errors.length) return Response.json({ error: errors[0], errors }, { status: 400 });

  /* ----- validate school (optional at this stage) ----- */
  const schoolName = str(schoolIn.name);
  const district = str(schoolIn.district);
  const sector = str(schoolIn.sector);
  const touched = schoolName !== "" || district !== "" || sector !== "";
  if (touched && !schoolName) {
    return Response.json({ error: "School name is required.", errors: ["School name is required."] }, { status: 400 });
  }

  /* ----- create school, admin, default year ----- */
  const school = await prisma.school.create({
    data: {
      id: "school_" + crypto.randomUUID().slice(0, 8),
      name: schoolName.slice(0, 120), // may be empty when the step was skipped (legacy parity)
      district: district.slice(0, 80),
      sector: sector.slice(0, 80),
      levels: JSON.stringify([]),
    },
  });
  await prisma.learningArea.createMany({
    data: DEFAULT_AREAS.map((n) => ({ schoolId: school.id, name: n, id: "a-" + n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 14) })),
  });
  await prisma.subject.createMany({
    data: DEFAULT_AREAS.map((n) => ({
      schoolId: school.id,
      name: n,
      id: "s-" + n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 14) + "-" + crypto.randomUUID().slice(0, 4),
    })),
  });
  const { salt, hash } = hashPassword(password);
  const user = await prisma.user.create({
    data: {
      id: "user_" + crypto.randomUUID().slice(0, 8),
      schoolId: school.id,
      name: name.slice(0, 80),
      email,
      role: "admin",
      salt,
      passwordHash: hash,
      language,
      mustChangePassword: false,
    },
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
  await prisma.user.update({ where: { id: user.id }, data: { activeYearId: year.id } });

  throttleRecord(ip, true);

  await assignDefaultSubscription(school.id, { name: user.name, email: user.email });

  await audit({
    actorType: "school_user",
    actorId: user.id,
    actorName: user.name,
    actorEmail: user.email,
    action: "school.registered",
    targetType: "school",
    targetId: school.id,
    schoolId: school.id,
    summary: `Initial school registered: ${school.name || "(unnamed)"}`,
    ip: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    metadata: { source: "first-run-signup" },
  });

  const token = await createSession(user.id);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
  return Response.json(
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
    },
    { status: 201 }
  );
}
