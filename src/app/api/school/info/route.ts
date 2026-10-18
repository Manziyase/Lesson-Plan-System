import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/session";
import { str } from "@/lib/util";
import { isSchoolLevel, isOwnership, isPhone } from "@/lib/validation";

export const dynamic = "force-dynamic";

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
  const school = await prisma.school.findUnique({ where: { id: user.schoolId } });
  if (!school) return Response.json({ error: "School not found." }, { status: 404 });
  const name = str(body.name);
  if (!name) return Response.json({ error: "School name is required." }, { status: 400 });

  const code = str(body.code);
  const level = isSchoolLevel(body.level) ? body.level : "";
  const ownership = isOwnership(body.ownership) ? body.ownership : "";
  const officialEmail = str(body.officialEmail).toLowerCase();
  if (officialEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(officialEmail)) {
    return Response.json({ error: "Please enter a valid official school email." }, { status: 400 });
  }
  const officialPhone = str(body.officialPhone);
  if (officialPhone && !isPhone(officialPhone)) {
    return Response.json({ error: "Please enter a valid official school phone number." }, { status: 400 });
  }

  const updated = await prisma.school.update({
    where: { id: school.id },
    data: {
      name: name.slice(0, 120),
      ...(body.code !== undefined ? { code: code.slice(0, 40) } : {}),
      ...(body.level !== undefined ? { level } : {}),
      ...(body.ownership !== undefined ? { ownership } : {}),
      ...(body.province !== undefined ? { province: str(body.province).slice(0, 40) } : {}),
      ...(body.district !== undefined ? { district: str(body.district).slice(0, 60) } : {}),
      ...(body.sector !== undefined ? { sector: str(body.sector).slice(0, 60) } : {}),
      ...(body.cell !== undefined ? { cell: str(body.cell).slice(0, 60) } : {}),
      ...(body.village !== undefined ? { village: str(body.village).slice(0, 60) } : {}),
      ...(body.address !== undefined ? { address: str(body.address).slice(0, 160) } : {}),
      ...(body.officialEmail !== undefined ? { officialEmail: officialEmail.slice(0, 120) } : {}),
      ...(body.officialPhone !== undefined ? { officialPhone: officialPhone.slice(0, 30) } : {}),
    },
  });
  return Response.json({
    school: {
      id: updated.id,
      name: updated.name,
      code: updated.code,
      level: updated.level,
      ownership: updated.ownership,
      province: updated.province,
      district: updated.district,
      sector: updated.sector,
      cell: updated.cell,
      village: updated.village,
      address: updated.address,
      officialEmail: updated.officialEmail,
      officialPhone: updated.officialPhone,
      createdAt: updated.createdAt,
    },
  });
}
