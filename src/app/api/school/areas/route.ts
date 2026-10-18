import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/session";
import { str } from "@/lib/util";

export const dynamic = "force-dynamic";

/**
 * Admin learning-area management (port of PUT /api/school/areas):
 *   { add: "name" }    — add a new area (case-insensitive dedupe)
 *   { remove: "name" } — refuse if any plan row or lesson still uses it
 */
export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const school = await prisma.school.findUnique({
    where: { id: user.schoolId },
    include: { learningAreas: { orderBy: { name: "asc" } } },
  });
  if (!school) return Response.json({ error: "School not found." }, { status: 404 });

  if (str(body.add)) {
    const name = str(body.add).slice(0, 80);
    if (!name) return Response.json({ error: "Area name is required." }, { status: 400 });
    if (school.learningAreas.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
      return Response.json({ error: "That learning area already exists." }, { status: 409 });
    }
    const id = "a-" + crypto.randomUUID().slice(0, 8);
    await prisma.learningArea.create({ data: { id, schoolId: school.id, name } });
  } else if (str(body.remove)) {
    const name = str(body.remove);
    const rec = school.learningAreas.find((a) => a.name === name);
    if (!rec) return Response.json({ error: "Learning area not found." }, { status: 404 });
    const inUse =
      (await prisma.planRow.count({ where: { learningAreaId: rec.id } })) > 0 ||
      (await prisma.lesson.count({ where: { learningAreaId: rec.id } })) > 0;
    if (inUse) {
      return Response.json({ error: "This area is used by existing plans or lessons, so it cannot be removed." }, { status: 409 });
    }
    await prisma.learningArea.delete({ where: { id: rec.id } });
  }

  const learningAreas = await prisma.learningArea.findMany({ where: { schoolId: school.id }, orderBy: { name: "asc" } });
  return Response.json({ learningAreas });
}
