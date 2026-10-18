import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/session";
import { str, isValidDate, parseNumberArray } from "@/lib/util";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const years = await prisma.academicYear.findMany({ where: { schoolId: user.schoolId }, orderBy: { startDate: "desc" } });
  return Response.json({ years: years.map((y) => ({ ...y, terms: parseNumberArray(y.terms) })) });
}

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
  const label = str(body.label);
  const startDate = str(body.startDate);
  const endDate = str(body.endDate);
  if (!label) return Response.json({ error: "Year label is required (e.g. 2026-2027)." }, { status: 400 });
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    return Response.json({ error: "Start and end dates are required (YYYY-MM-DD)." }, { status: 400 });
  }
  if (endDate < startDate) return Response.json({ error: "End date must be after start date." }, { status: 400 });
  if (await prisma.academicYear.findFirst({ where: { schoolId: user.schoolId, label } })) {
    return Response.json({ error: "An academic year with this label already exists." }, { status: 400 });
  }
  const id = crypto.randomUUID();
  const year = await prisma.academicYear.create({
    data: {
      id,
      schoolId: user.schoolId,
      label,
      startDate,
      endDate,
      terms: JSON.stringify(Array.isArray(body.terms) ? (body.terms as unknown[]).map(Number).filter((t) => t === 1 || t === 2 || t === 3).slice(0, 3) : [1, 2, 3]),
      isActive: false,
    },
  });
  return Response.json({ year: { ...year, terms: parseNumberArray(year.terms) } }, { status: 201 });
}
