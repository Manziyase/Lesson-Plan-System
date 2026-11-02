/*
 * Server-side loader for the app-wide meta payload (school, teachers,
 * classes, levels, learning areas, academic years, admin counters).
 *
 * Shared by the guarded `(app)` layout AND the standalone `/profile`
 * layout so every shell route is fed identical context. It lives outside
 * a layout because /profile cannot live in the guarded (app) group — see
 * src/app/profile/layout.tsx for why the two layouts are split.
 */

import type { Meta } from "@/components/Shell";
import type { SessionUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getPlatformSettings } from "@/lib/platform";
import { classOrderKey, parseStringArray, LEVELS } from "@/lib/util";

export async function loadAppMeta(user: SessionUser): Promise<Meta> {
  const school = await prisma.school.findUnique({ where: { id: user.schoolId } });
  const teachers = await prisma.user.findMany({ where: { schoolId: user.schoolId } });
  const classes = (await prisma.class.findMany({ where: { schoolId: user.schoolId } })).sort((a, b) =>
    classOrderKey(a.name, a.level).localeCompare(classOrderKey(b.name, b.level))
  );
  const areas = (await prisma.learningArea.findMany({ where: { schoolId: user.schoolId } })).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const subjects = await prisma.subject.findMany({ where: { schoolId: user.schoolId }, orderBy: { name: "asc" } });
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
  const years = await prisma.academicYear.findMany({ where: { schoolId: user.schoolId }, orderBy: { startDate: "desc" } });
  const activeYear = years.find((y) => y.id === user.activeYearId) ?? years.find((y) => y.isActive) ?? years[0] ?? null;
  const configuredLevels = parseStringArray(school?.levels);
  const levels = LEVELS.filter((l) => configuredLevels.includes(l.id) || classes.some((c) => c.level === l.id));
  // Notification count for the admin: teacher plans awaiting approval.
  const pendingPlans =
    user.role === "admin"
      ? await prisma.plan.count({ where: { schoolId: user.schoolId, status: "pending" } })
      : 0;
  const settings = await getPlatformSettings();

  return {
    school: school
      ? {
          id: school.id,
          name: school.name,
          district: school.district,
          sector: school.sector,
          code: school.code,
          level: school.level,
          ownership: school.ownership,
          province: school.province,
          cell: school.cell,
          village: school.village,
          address: school.address,
          officialEmail: school.officialEmail,
          officialPhone: school.officialPhone,
        }
      : null,
    me: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      subjects: user.subjects,
      classes: user.classes,
      assignments: assignmentsByTeacher.get(user.id) ?? [],
      language: user.language,
      mustChangePassword: user.mustChangePassword,
    },
    teachers: teachers.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      email: u.email,
      subjects: parseStringArray(u.subjects),
      classes: parseStringArray(u.classes),
      assignments: assignmentsByTeacher.get(u.id) ?? [],
    })),
    classes,
    levels,
    learningAreas: areas,
    subjects: subjects.map((s) => ({ id: s.id, name: s.name })),
    years: years.map((y) => ({ id: y.id, label: y.label, startDate: y.startDate, endDate: y.endDate, isActive: y.isActive })),
    activeYear: activeYear ? { id: activeYear.id, label: activeYear.label, isActive: activeYear.isActive } : null,
    pendingPlans,
    features: settings.features,
  };
}
