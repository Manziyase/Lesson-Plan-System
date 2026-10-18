import { prisma } from "@/lib/db";
import { getSessionUser, publicUser, unauthorized } from "@/lib/session";
import { str } from "@/lib/util";
import { isSupportedLang } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/** Any signed-in user can update their own display name and preferences. */
export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }

  /* Language-only updates are allowed (the selector sends just the language). */
  const langOnly =
    typeof body.language === "string" && body.name === undefined && body.subjects === undefined && body.classes === undefined;
  if (langOnly) {
    if (!isSupportedLang(body.language)) {
      return Response.json({ error: "Unsupported language." }, { status: 400 });
    }
    await prisma.user.update({ where: { id: user.id }, data: { language: body.language } });
    return Response.json({ user: publicUser({ ...user, language: body.language }) });
  }

  const name = str(body.name);
  if (!name) return Response.json({ error: "Name is required." }, { status: 400 });
  const data: Record<string, unknown> = { name: name.slice(0, 80) };
  if (typeof body.language === "string" && isSupportedLang(body.language)) data.language = body.language;
  if (Array.isArray(body.subjects)) {
    data.subjects = JSON.stringify((body.subjects as unknown[]).map((s) => str(s)).filter(Boolean).slice(0, 12));
  }
  if (Array.isArray(body.classes)) {
    data.classes = JSON.stringify((body.classes as unknown[]).map((s) => str(s)).filter(Boolean).slice(0, 12));
  }
  const updated = await prisma.user.update({ where: { id: user.id }, data });
  return Response.json({
    user: publicUser({
      ...user,
      name: updated.name,
      language: updated.language,
      subjects: data.subjects ? JSON.parse(String(data.subjects)) : user.subjects,
      classes: data.classes ? JSON.parse(String(data.classes)) : user.classes,
    }),
  });
}
