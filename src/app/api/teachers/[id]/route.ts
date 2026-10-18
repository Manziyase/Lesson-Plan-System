import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/session";
import { str, EMAIL_RE, parseStringArray } from "@/lib/util";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function teacherJson(u: { id: string; name: string; email: string; role: string; schoolId: string; subjects: string; classes: string; language: string; mustChangePassword: boolean; createdAt: Date }) {
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
  if (Array.isArray(body.subjects)) {
    data.subjects = JSON.stringify((body.subjects as unknown[]).map((s) => str(s)).filter(Boolean).slice(0, 12));
  }
  if (Array.isArray(body.classes)) {
    data.classes = JSON.stringify((body.classes as unknown[]).map((s) => str(s)).filter(Boolean).slice(0, 12));
  }
  const updated = await prisma.user.update({ where: { id: target.id }, data });
  return Response.json({ teacher: teacherJson(updated) });
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
