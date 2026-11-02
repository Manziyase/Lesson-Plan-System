import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/session";
import { str } from "@/lib/util";

/** Static list of school subjects managed by admin (first-run seed + admin add). */
const SEED_SUBJECTS = [
  "Kinyarwanda",
  "English",
  "French",
  "Mathematics",
  "Integrated Science",
  "Physics",
  "Chemistry",
  "Biology",
  "History",
  "Geography",
  "Civics & Economic",
  "Agriculture",
  "Industry & Entrepreneurship",
  "Fine Arts",
  "Performing Arts",
  "PE & Sports",
  "Evangelism / Christian morality",
];

const SUBJECT_LIMIT = 40;

async function getSchool() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();
  const school = await prisma.school.findUnique({
    where: { id: user.schoolId },
    include: { subjects: true },
  });
  if (!school) return Response.json({ error: "School not found." }, { status: 404 });
  return { school, user };
}

function subjectSlug(name: string) {
  return "s-" + name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

/** GET /api/school/subjects — list all subjects the admin has configured. */
export async function GET() {
  const r = await getSchool();
  if (r instanceof Response) return r;
  const { school, user } = r;
  let subjects = school.subjects;
  // Older schools were created before Subjects management existed. Seed the
  // standard list once so assignments can start immediately.
  if (subjects.length === 0) {
    await prisma.subject.createMany({
      data: SEED_SUBJECTS.map((n) => ({
        id: subjectSlug(n) + "-" + crypto.randomUUID().slice(0, 4),
        schoolId: school.id,
        name: n,
      })),
      skipDuplicates: true,
    });
    subjects = await prisma.subject.findMany({ where: { schoolId: user.schoolId } });
  }
  const list = subjects.map((s) => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name));
  return Response.json({ subjects: list });
}

/** POST /api/school/subjects — add a new subject (admin only). */
export async function POST(req: Request) {
  const r = await getSchool();
  if (r instanceof Response) return r;
  const { school, user } = r;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const name = str(body.name || body.add);
  if (!name) return Response.json({ error: "Subject name is required." }, { status: 400 });
  const n = name.trim().slice(0, 80);
  if (school.subjects.some((s) => s.name.toLowerCase() === n.toLowerCase())) {
    return Response.json({ error: "That subject already exists." }, { status: 409 });
  }
  if (school.subjects.length >= SUBJECT_LIMIT) {
    return Response.json({ error: "Subject list is full." }, { status: 400 });
  }
  const id = subjectSlug(n) + "-" + crypto.randomUUID().slice(0, 4);
  await prisma.subject.create({ data: { id, schoolId: school.id, name: n } });
  const fresh = await prisma.subject.findMany({
    where: { schoolId: school.id },
    orderBy: { name: "asc" },
  });
  return Response.json({ subjects: fresh.map((s) => ({ id: s.id, name: s.name })) });
}

// Subject deletion lives in ./[id]/route.ts so the collection route only
// exports valid Route Handlers (GET/POST).
