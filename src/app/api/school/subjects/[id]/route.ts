import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/session";
import { str } from "@/lib/util";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function freshList(schoolId: string) {
  const fresh = await prisma.subject.findMany({
    where: { schoolId },
    orderBy: { name: "asc" },
  });
  return fresh.map((s) => ({ id: s.id, name: s.name }));
}

/**
 * PUT /api/school/subjects/[id] — rename a subject while keeping its id, so
 * every teacher-class-subject assignment and every lesson plan stays linked.
 */
export async function PUT(req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();
  const { id } = await params;
  const target = await prisma.subject.findFirst({ where: { id, schoolId: user.schoolId } });
  if (!target) return Response.json({ error: "Subject not found." }, { status: 404 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const name = str(body.name).trim().slice(0, 80);
  if (!name) return Response.json({ error: "Subject name is required." }, { status: 400 });

  const clash = await prisma.subject.findFirst({
    where: { schoolId: user.schoolId, name, id: { not: target.id } },
  });
  if (clash) return Response.json({ error: "That subject already exists." }, { status: 409 });

  await prisma.$transaction([
    prisma.subject.update({ where: { id: target.id }, data: { name } }),
    // Keep the denormalised names shown in older plans in step with the
    // school subject list (ids stay the same, so nothing becomes invalid).
    prisma.planRow.updateMany({
      where: { learningAreaId: target.id, plan: { schoolId: user.schoolId } },
      data: { learningArea: name },
    }),
    prisma.lesson.updateMany({
      where: { learningAreaId: target.id, schoolId: user.schoolId },
      data: { learningArea: name },
    }),
  ]);
  return Response.json({ subjects: await freshList(user.schoolId) });
}

/** DELETE /api/school/subjects/[id] — remove a subject from the school (admin only). */
export async function DELETE(_req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();
  const { id } = await params;
  const target = await prisma.subject.findFirst({ where: { id, schoolId: user.schoolId } });
  if (!target) return Response.json({ error: "Subject not found." }, { status: 404 });

  // Keep archives intact: a subject that already appears in saved plans or
  // lessons cannot be deleted (renaming it is the safe option).
  const [planRows, lessons] = await Promise.all([
    prisma.planRow.count({ where: { learningAreaId: id } }),
    prisma.lesson.count({ where: { learningAreaId: id } }),
  ]);
  if (planRows > 0 || lessons > 0) {
    return Response.json(
      { error: "This subject is used by saved lesson plans. Rename it instead, or remove those plans first." },
      { status: 409 }
    );
  }

  await prisma.subject.delete({ where: { id: target.id } });
  return Response.json({ subjects: await freshList(user.schoolId) });
}
