import { prisma } from "@/lib/db";
import { getSessionUser, publicUser, unauthorized } from "@/lib/session";
import { getPlatformSettings } from "@/lib/platform";
import { classOrderKey, parseStringArray, parseNumberArray, LEVELS } from "@/lib/util";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const school = await prisma.school.findUnique({ where: { id: user.schoolId } });
  const teachers = await prisma.user.findMany({ where: { schoolId: user.schoolId } });
  const classes = (await prisma.class.findMany({ where: { schoolId: user.schoolId } })).sort((a, b) =>
    classOrderKey(a.name, a.level).localeCompare(classOrderKey(b.name, b.level))
  );
  const subjects = (await prisma.subject.findMany({ where: { schoolId: user.schoolId } }));
  const subjectList = subjects.map((s) => ({ id: s.id, name: s.name }));
  const assignments = await prisma.teachingAssignment.findMany({
    where: { schoolId: user.schoolId },
    include: { class: true, subject: true },
    orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }],
  });
  const assignmentsByTeacher = new Map<string, { classId: string; className: string; subjectId: string; subjectName: string }[]>();
  for (const a of assignments) {
    const list = assignmentsByTeacher.get(a.teacherId) ?? [];
    list.push({ classId: a.classId, className: a.class.name, subjectId: a.subjectId, subjectName: a.subject.name });
    assignmentsByTeacher.set(a.teacherId, list);
  }
  const areas = (await prisma.learningArea.findMany({ where: { schoolId: user.schoolId } })).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const years = await prisma.academicYear.findMany({
    where: { schoolId: user.schoolId },
    orderBy: { startDate: "desc" },
  });
  const activeYear = years.find((y) => y.id === user.activeYearId) ?? years.find((y) => y.isActive) ?? years[0] ?? null;
  const configuredLevels = parseStringArray(school?.levels);
  const levels = LEVELS.filter((l) => configuredLevels.includes(l.id) || classes.some((c) => c.level === l.id));
  // Notification helper for the admin: how many plans await approval.
  const pendingPlans =
    user.role === "admin"
      ? await prisma.plan.count({ where: { schoolId: user.schoolId, status: "pending" } })
      : 0;
  const settings = await getPlatformSettings();

  return Response.json({
    school: school
      ? { id: school.id, name: school.name, district: school.district, sector: school.sector }
      : null,
    pendingPlans,
    features: settings.features,
    me: { ...publicUser(user), assignments: assignmentsByTeacher.get(user.id) ?? [] },
    teachers: teachers.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      email: u.email,
      subjects: parseStringArray(u.subjects),
      classes: parseStringArray(u.classes),
      assignments: assignmentsByTeacher.get(u.id) ?? [],
    })),
    subjects: subjectList,
    classes,
    levels,
    learningAreas: areas,
    years: years.map((y) => ({ ...y, terms: parseNumberArray(y.terms) })),
    activeYear: activeYear ? { ...activeYear, terms: parseNumberArray(activeYear.terms) } : null,
  });
}
