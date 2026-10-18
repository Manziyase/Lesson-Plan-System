import { redirect } from "next/navigation";
import { getSessionUser, publicUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Shell, type Meta } from "@/components/Shell";
import { ToastProvider, ConfirmProvider } from "@/components/ui";
import { LangProvider } from "@/lib/i18n-client";
import { classOrderKey, parseStringArray, LEVELS } from "@/lib/util";

export const dynamic = "force-dynamic";

/*
 * Auth-guarded layout: every app page renders inside the shell and only for
 * signed-in users. Meta (school, classes, areas, years, teachers) is loaded
 * server-side and provided through context.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/profile");

  const school = await prisma.school.findUnique({ where: { id: user.schoolId } });
  const teachers = await prisma.user.findMany({ where: { schoolId: user.schoolId } });
  const classes = (await prisma.class.findMany({ where: { schoolId: user.schoolId } })).sort((a, b) =>
    classOrderKey(a.name, a.level).localeCompare(classOrderKey(b.name, b.level))
  );
  const areas = (await prisma.learningArea.findMany({ where: { schoolId: user.schoolId } })).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const years = await prisma.academicYear.findMany({ where: { schoolId: user.schoolId }, orderBy: { startDate: "desc" } });
  const activeYear = years.find((y) => y.id === user.activeYearId) ?? years.find((y) => y.isActive) ?? years[0] ?? null;
  const configuredLevels = parseStringArray(school?.levels);
  const levels = LEVELS.filter((l) => configuredLevels.includes(l.id) || classes.some((c) => c.level === l.id));
  // Notification count for the admin: teacher plans awaiting approval.
  const pendingPlans =
    user.role === "admin"
      ? await prisma.plan.count({ where: { schoolId: user.schoolId, status: "pending" } })
      : 0;

  const meta: Meta = {
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
    me: publicUser(user) as unknown as Meta["me"],
    teachers: teachers.map((u) => ({ id: u.id, name: u.name, role: u.role, email: u.email, subjects: parseStringArray(u.subjects), classes: parseStringArray(u.classes) })),
    classes,
    levels,
    learningAreas: areas,
    years: years.map((y) => ({ id: y.id, label: y.label, startDate: y.startDate, endDate: y.endDate, isActive: y.isActive })),
    activeYear: activeYear ? { id: activeYear.id, label: activeYear.label, isActive: activeYear.isActive } : null,
    pendingPlans,
  };

  return (
    <LangProvider initial={(user.language as "en" | "fr" | "rw") || "en"}>
      <ToastProvider>
        <ConfirmProvider>
          <Shell meta={meta}>{children}</Shell>
        </ConfirmProvider>
      </ToastProvider>
    </LangProvider>
  );
}
