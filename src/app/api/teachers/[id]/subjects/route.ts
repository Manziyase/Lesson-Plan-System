import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/session";
import { parseStringArray, str } from "@/lib/util";
import { AssignmentError, syncTeacherAssignments } from "@/lib/assignments";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/teachers/[id]/subjects — legacy subject list endpoint.
 *
 * Mirrors the old global subject list into explicit TeachingAssignment rows
 * for each class the teacher already covers, so the planner and the legacy
 * JSON columns stay in sync.
 */
export async function POST(req: Request, { params }: Params) {
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
  if (!Array.isArray(body.subjects)) {
    return Response.json({ error: "A list of subjects is required." }, { status: 400 });
  }
  const names = Array.from(
    new Set((body.subjects as unknown[]).map((s) => str(s).toLowerCase()).filter(Boolean))
  ).slice(0, 24);

  const [classes, subjects, current] = await Promise.all([
    prisma.class.findMany({ where: { schoolId: user.schoolId } }),
    prisma.subject.findMany({ where: { schoolId: user.schoolId } }),
    prisma.teachingAssignment.findMany({ where: { schoolId: user.schoolId, teacherId: target.id } }),
  ]);
  const subjectIds = subjects.filter((s) => names.includes(s.name.toLowerCase())).map((s) => s.id);
  const currentClassIds = new Set(current.map((a) => a.classId));
  const entries = classes
    .filter((c) => currentClassIds.has(c.id))
    .map((c) => ({ classId: c.id, subjectIds }));

  try {
    const fresh = await prisma.$transaction(async (tx) => {
      await syncTeacherAssignments(tx, { schoolId: user.schoolId, teacherId: target.id, entries });
      return tx.user.findUniqueOrThrow({ where: { id: target.id } });
    }, { maxWait: 10_000, timeout: 20_000 });
    return Response.json({ teacher: teacherJson(fresh) });
  } catch (e) {
    if (e instanceof AssignmentError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

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
}) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    schoolId: u.schoolId,
    subjects: parseStringArray(u.subjects),
    classes: parseStringArray(u.classes),
    language: u.language,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt,
  };
}
