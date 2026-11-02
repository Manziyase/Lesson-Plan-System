import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/session";
import { str, EMAIL_RE, parseStringArray } from "@/lib/util";
import {
  AssignmentError,
  parseAssignmentInput,
  syncTeacherAssignments,
  type AssignmentInput,
} from "@/lib/assignments";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function teacherJson(u: {
  id: string;
  name: string;
  email: string;
  role: string;
  schoolId: string;
  subjects: string;
  classes: string;
  language: string;
  mustChangePassword: boolean;
  createdAt: Date;
}, assignments: { classId: string; className: string; subjectId: string; subjectName: string }[]) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    schoolId: u.schoolId,
    subjects: parseStringArray(u.subjects),
    classes: parseStringArray(u.classes),
    assignments,
    language: u.language,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt,
  };
}

async function legacyInputsFromNames(
  schoolId: string,
  subjects: unknown,
  classes: unknown
): Promise<AssignmentInput[]> {
  if (!Array.isArray(subjects) || !Array.isArray(classes)) return [];
  const subjectNames = Array.from(new Set(subjects.map((s) => str(s)).filter(Boolean)));
  const classNames = Array.from(new Set(classes.map((c) => str(c)).filter(Boolean)));
  if (!subjectNames.length || !classNames.length) return [];
  const [subjectRows, classRows] = await Promise.all([
    prisma.subject.findMany({ where: { schoolId, name: { in: subjectNames } } }),
    prisma.class.findMany({ where: { schoolId, name: { in: classNames } } }),
  ]);
  const subjectByName = new Map(subjectRows.map((s) => [s.name.toLowerCase(), s]));
  const classByName = new Map(classRows.map((c) => [c.name.toLowerCase(), c]));
  return classNames.flatMap((name) => {
    const cls = classByName.get(name.toLowerCase());
    if (!cls) return [];
    const subjectIds = subjectNames
      .map((n) => subjectByName.get(n.toLowerCase())?.id)
      .filter((id): id is string => Boolean(id));
    return subjectIds.length ? [{ classId: cls.id, subjectIds }] : [];
  });
}

export async function PUT(req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();
  const { id } = await params;
  const target = await prisma.user.findFirst({ where: { id, schoolId: user.schoolId } });
  if (!target) return Response.json({ error: "Teacher not found." }, { status: 404 });
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const data: Record<string, unknown> = {};
  const name = str(body.name);
  if (name) data.name = name.slice(0, 80);
  const email = str(body.email).toLowerCase();
  if (email) {
    if (!EMAIL_RE.test(email)) {
      return Response.json({ error: "A valid email address is required." }, { status: 400 });
    }
    if (await prisma.user.findFirst({ where: { email, id: { not: target.id } } })) {
      return Response.json({ error: "A user with this email already exists." }, { status: 400 });
    }
    data.email = email;
  }
  if (body.role === "admin" || body.role === "teacher") {
    if (target.id === user.id && body.role !== "admin") {
      return Response.json({ error: "You cannot demote your own account." }, { status: 400 });
    }
    data.role = body.role;
  }

  const parsed = parseAssignmentInput(body.assignments);
  let entries: AssignmentInput[] | null = parsed;
  if (entries === null && (Array.isArray(body.subjects) || Array.isArray(body.classes))) {
    entries = await legacyInputsFromNames(user.schoolId, body.subjects, body.classes);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id: target.id }, data });
      const assignments = entries
        ? await syncTeacherAssignments(tx, { schoolId: user.schoolId, teacherId: target.id, entries })
        : (
            await tx.teachingAssignment.findMany({
              where: { schoolId: user.schoolId, teacherId: target.id },
              include: { class: true, subject: true },
              orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }],
            })
          ).map((a) => ({
            classId: a.classId,
            className: a.class.name,
            subjectId: a.subjectId,
            subjectName: a.subject.name,
          }));
      return { updated, assignments };
    }, { maxWait: 10_000, timeout: 20_000 });
    return Response.json({ teacher: teacherJson(result.updated, result.assignments) });
  } catch (e) {
    if (e instanceof AssignmentError) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();
  const { id } = await params;
  const target = await prisma.user.findFirst({ where: { id, schoolId: user.schoolId } });
  if (!target) return Response.json({ error: "Teacher not found." }, { status: 404 });
  if (target.id === user.id) {
    return Response.json({ error: "You cannot remove your own account." }, { status: 400 });
  }
  /* Their lesson plans remain in the archive (plans are kept, account removed). */
  await prisma.user.delete({ where: { id: target.id } });
  return Response.json({ ok: true });
}
