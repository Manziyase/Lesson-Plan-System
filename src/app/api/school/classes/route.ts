import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized, forbidden } from "@/lib/session";
import { classDisplayName, LEVELS } from "@/lib/util";

export const dynamic = "force-dynamic";

const STREAM_RE = /^[A-Z]$/;

/**
 * Admin: which levels/classes the school offers (port of PUT /api/school/classes).
 * Rebuilds the Class list; keeps existing ids when a class already existed so
 * plan-row references survive configuration changes.
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
  const school = await prisma.school.findUnique({ where: { id: user.schoolId }, include: { classes: true } });
  if (!school) return Response.json({ error: "School not found." }, { status: 404 });

  const rawLevels = Array.isArray(body.levels) ? (body.levels as unknown[]).map(String) : [];
  const selected = rawLevels.filter((l) => LEVELS.some((x) => x.id === l));
  if (!selected.length) {
    return Response.json({ error: "Select at least one level." }, { status: 400 });
  }

  const rawStreams = (body.streamsByLevel as Record<string, unknown>) || {};
  const streamsByLevel: Record<string, string[]> = {};
  for (const lv of selected) {
    const arr = Array.isArray(rawStreams[lv])
      ? Array.from(new Set((rawStreams[lv] as unknown[]).map((s) => String(s).trim().toUpperCase()).filter((s) => STREAM_RE.test(s)))).sort()
      : [];
    streamsByLevel[lv] = arr.slice(0, 8);
  }

  const existingByName = new Map(school.classes.map((c) => [c.name, c]));
  const classes: { id: string; schoolId: string; name: string; level: string; stream: string | null }[] = [];
  for (const lv of selected) {
    const streams = streamsByLevel[lv];
    const names = streams.length ? streams.map((s) => classDisplayName(lv, s)) : [classDisplayName(lv, null)];
    for (const name of names) {
      const prior = existingByName.get(name);
      classes.push({
        id: prior?.id ?? "class_" + crypto.randomUUID().slice(0, 8),
        schoolId: school.id,
        name,
        level: lv,
        stream: streams.length ? name.slice(-1) : null,
      });
    }
  }

  await prisma.$transaction([
    prisma.class.deleteMany({ where: { schoolId: school.id, id: { notIn: classes.map((c) => c.id) } } }),
    ...classes.map((c) =>
      prisma.class.upsert({
        where: { id: c.id },
        create: { id: c.id, schoolId: c.schoolId, name: c.name, level: c.level, stream: c.stream },
        update: { name: c.name, level: c.level, stream: c.stream },
      })
    ),
  ]);
  await prisma.school.update({ where: { id: school.id }, data: { levels: JSON.stringify(selected) } });

  const fresh = await prisma.class.findMany({ where: { schoolId: school.id } });
  return Response.json({
    school: { id: school.id, name: school.name, levels: selected, classes: fresh },
  });
}
