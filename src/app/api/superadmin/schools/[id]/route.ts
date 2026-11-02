import { prisma } from "@/lib/db";
import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { auditFromRequest } from "@/lib/audit";
import {
  badRequest,
  clean,
  isEmail,
  notFound,
  readBody,
  safeJson,
} from "@/lib/platform-utils";
import { isOwnership, isSchoolLevel } from "@/lib/validation";
import { LEVELS } from "@/lib/util";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const VALID_LEVELS = new Set(LEVELS.map((l) => l.id));

export async function GET(_req: Request, { params }: Params) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();
  const { id } = await params;

  const school = await prisma.school.findUnique({
    where: { id },
    include: {
      users: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          statusReason: true,
          lastLoginAt: true,
          createdAt: true,
          disabledAt: true,
        },
      },
      classes: { select: { id: true, name: true, level: true, stream: true }, orderBy: { name: "asc" } },
      academicYears: {
        select: { id: true, label: true, startDate: true, endDate: true, isActive: true },
        orderBy: { startDate: "desc" },
      },
      subscriptions: {
        orderBy: { createdAt: "desc" },
        include: {
          plan: {
            select: {
              id: true,
              name: true,
              code: true,
              monthlyPrice: true,
              annualPrice: true,
              currency: true,
            },
          },
        },
      },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 25,
        include: { subscription: { select: { id: true, plan: { select: { name: true } } } } },
      },
      _count: { select: { users: true, classes: true, plans: true, subjects: true, assignments: true } },
    },
  });
  if (!school) return notFound("School not found.");

  const [lessons, recentLogs, currentSubscription] = await Promise.all([
    prisma.lesson.count({ where: { schoolId: id } }),
    prisma.auditLog.findMany({
      where: { schoolId: id },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        action: true,
        actorType: true,
        actorName: true,
        actorEmail: true,
        summary: true,
        createdAt: true,
      },
    }),
    prisma.schoolSubscription.findFirst({
      where: { schoolId: id, status: { in: ["trial", "active"] } },
      orderBy: { createdAt: "desc" },
      include: { plan: { select: { id: true, name: true, code: true } } },
    }),
  ]);

  const teachers = school.users.filter((u) => u.role === "teacher");
  const admins = school.users.filter((u) => u.role === "admin");

  return Response.json(
    {
      school: {
        id: school.id,
        name: school.name,
        code: school.code,
        level: school.level,
        ownership: school.ownership,
        province: school.province,
        district: school.district,
        sector: school.sector,
        cell: school.cell,
        village: school.village,
        address: school.address,
        officialEmail: school.officialEmail,
        officialPhone: school.officialPhone,
        levels: safeJson<string[]>(school.levels, []),
        status: school.status,
        statusReason: school.statusReason,
        statusChangedAt: school.statusChangedAt,
        createdAt: school.createdAt,
        updatedAt: school.updatedAt,
        lastActiveAt: school.lastActiveAt,
      },
      counts: {
        users: school._count.users,
        teachers: teachers.length,
        admins: admins.length,
        classes: school._count.classes,
        plans: school._count.plans,
        lessons,
        subjects: school._count.subjects,
        assignments: school._count.assignments,
        disabledUsers: school.users.filter((u) => u.status !== "active").length,
      },
      users: school.users,
      classes: school.classes,
      academicYears: school.academicYears,
      subscription: currentSubscription
        ? {
            id: currentSubscription.id,
            status: currentSubscription.status,
            billingCycle: currentSubscription.billingCycle,
            startDate: currentSubscription.startDate,
            renewsAt: currentSubscription.renewsAt,
            endsAt: currentSubscription.endsAt,
            notes: currentSubscription.notes,
            plan: currentSubscription.plan,
          }
        : null,
      subscriptionHistory: school.subscriptions,
      payments: school.payments,
      recentLogs,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function PATCH(req: Request, { params }: Params) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();
  const { id } = await params;

  const school = await prisma.school.findUnique({ where: { id } });
  if (!school) return notFound("School not found.");

  const body = await readBody(req);
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = clean(body.name, 120);
    if (!name) return badRequest("School name is required.");
    data.name = name;
  }
  if (body.code !== undefined) data.code = clean(body.code, 40);
  if (body.level !== undefined) {
    if (!isSchoolLevel(body.level)) return badRequest("Invalid school level.");
    data.level = body.level;
  }
  if (body.ownership !== undefined) {
    if (!isOwnership(body.ownership)) return badRequest("Invalid ownership type.");
    data.ownership = body.ownership;
  }
  for (const [key, max] of [
    ["province", 40],
    ["district", 60],
    ["sector", 60],
    ["cell", 60],
    ["village", 60],
    ["address", 160],
  ] as const) {
    if (body[key] !== undefined) data[key] = clean(body[key], max);
  }
  if (body.officialEmail !== undefined) {
    const email = clean(body.officialEmail, 120).toLowerCase();
    if (email && !isEmail(email)) return badRequest("Please enter a valid official school email.");
    data.officialEmail = email;
  }
  if (body.officialPhone !== undefined) data.officialPhone = clean(body.officialPhone, 30);

  if (body.levels !== undefined) {
    if (!Array.isArray(body.levels)) return badRequest("School levels must be a list.");
    const levels = Array.from(
      new Set(body.levels.map((v) => clean(v, 4)).filter((v) => VALID_LEVELS.has(v)))
    );
    data.levels = JSON.stringify(levels);
  }

  if (!Object.keys(data).length) return badRequest("No changes were provided.");

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(data)) {
    const before = (school as unknown as Record<string, unknown>)[key];
    if (String(before) !== String(value)) changes[key] = { from: before, to: value };
  }
  if (!Object.keys(changes).length) {
    return Response.json({ ok: true, changed: false });
  }

  const updated = await prisma.school.update({ where: { id }, data });

  await auditFromRequest(req, admin, {
    action: "school.updated",
    targetType: "school",
    targetId: id,
    schoolId: id,
    summary: `Updated school information: ${updated.name}`,
    metadata: { changes: Object.keys(changes) },
  });

  return Response.json({
    ok: true,
    changed: true,
    school: {
      id: updated.id,
      name: updated.name,
      code: updated.code,
      level: updated.level,
      ownership: updated.ownership,
      province: updated.province,
      district: updated.district,
      sector: updated.sector,
      cell: updated.cell,
      village: updated.village,
      address: updated.address,
      officialEmail: updated.officialEmail,
      officialPhone: updated.officialPhone,
      status: updated.status,
      statusReason: updated.statusReason,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    },
  });
}
