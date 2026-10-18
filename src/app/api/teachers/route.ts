import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { str, EMAIL_RE } from "@/lib/util";

export const dynamic = "force-dynamic";

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
  const { salt, hash } = hashPassword("changeme123");
  const created = await prisma.user.create({
    data: {
      id: "user_" + crypto.randomUUID().slice(0, 8),
      schoolId: user.schoolId,
      name,
      email,
      role,
      salt,
      passwordHash: hash,
      subjects: JSON.stringify(Array.isArray(body.subjects) ? (body.subjects as unknown[]).map((s) => str(s)).filter(Boolean).slice(0, 12) : []),
      classes: JSON.stringify(Array.isArray(body.classes) ? (body.classes as unknown[]).map((s) => str(s)).filter(Boolean).slice(0, 12) : []),
      mustChangePassword: true,
    },
  });
  return Response.json(
    {
      teacher: {
        id: created.id,
        name: created.name,
        email: created.email,
        role: created.role,
        schoolId: created.schoolId,
        subjects: [],
        classes: [],
        language: created.language,
        mustChangePassword: created.mustChangePassword,
        createdAt: created.createdAt,
      },
    },
    { status: 201 }
  );
}
