import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/session";
import { str, isValidDate, parseNumberArray } from "@/lib/util";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();
  const { id } = await params;
  const year = await prisma.academicYear.findFirst({ where: { id, schoolId: user.schoolId } });
  if (!year) return Response.json({ error: "Academic year not found." }, { status: 404 });
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const data: Record<string, unknown> = {};
  if (str(body.label)) data.label = str(body.label);
  if (isValidDate(body.startDate)) data.startDate = body.startDate;
  if (isValidDate(body.endDate)) data.endDate = body.endDate;
  if (Array.isArray(body.terms)) {
    data.terms = JSON.stringify((body.terms as unknown[]).map(Number).filter((t) => t === 1 || t === 2 || t === 3).slice(0, 3));
  }
  if (typeof body.isActive === "boolean" && body.isActive) {
    await prisma.$transaction([
      prisma.academicYear.updateMany({ where: { schoolId: user.schoolId }, data: { isActive: false } }),
      prisma.academicYear.update({ where: { id: year.id }, data: { isActive: true } }),
      prisma.user.update({ where: { id: user.id }, data: { activeYearId: year.id } }),
    ]);
  } else {
    await prisma.academicYear.update({ where: { id: year.id }, data });
  }
  const fresh = await prisma.academicYear.findUnique({ where: { id: year.id } });
  return Response.json({ year: { ...fresh!, terms: parseNumberArray(fresh!.terms) } });
}
