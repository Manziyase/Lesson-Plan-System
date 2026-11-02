import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { str, EMAIL_RE } from "@/lib/util";
import {
  AssignmentError,
  parseAssignmentInput,
  syncTeacherAssignments,
  type AssignmentInput,
} from "@/lib/assignments";

export const dynamic = "force-dynamic";

/** Older clients send subject/class names instead of ids. */
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

/* POST /api/teachers — admin creates staff accounts; initial password
   changeme123 with a forced change at first login (legacy parity). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const name = str(body.name);
  const email = str(body.email).toLowerCase();
  const role = body.role === "admin" ? "admin" : "teacher";
  if (!name) return Response.json({ error: "Teacher name is required." }, { status: 400 });
  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "A valid email address is required." }, { status: 400 });
  }
  if (await prisma.user.findFirst({ where: { email } })) {
    return Response.json({ error: "A user with this email already exists." }, { status: 400 });
  }
  const parsed = parseAssignmentInput(body.assignments);
  const entries = parsed ?? (await legacyInputsFromNames(user.schoolId, body.subjects, body.classes));
  const { salt, hash } = hashPassword("changeme123");
  try {
    const created = await prisma.$transaction(async (tx) => {
      const teacher = await tx.user.create({
        data: {
          id: "user_" + crypto.randomUUID().slice(0, 8),
          schoolId: user.schoolId,
          name,
          email,
          role,
          salt,
          passwordHash: hash,
          mustChangePassword: true,
        },
      });
      const assignments = await syncTeacherAssignments(tx, {
        schoolId: user.schoolId,
        teacherId: teacher.id,
        entries,
      });
      return { teacher, assignments };
    }, { maxWait: 10_000, timeout: 20_000 });
    return Response.json(
      {
        teacher: {
          id: created.teacher.id,
          name: created.teacher.name,
          email: created.teacher.email,
          role: created.teacher.role,
          schoolId: created.teacher.schoolId,
          subjects: created.teacher.subjects,
          classes: created.teacher.classes,
          assignments: created.assignments,
          language: created.teacher.language,
          mustChangePassword: created.teacher.mustChangePassword,
          createdAt: created.teacher.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof AssignmentError) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
