import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/session";
import { verifyPassword, hashPassword } from "@/lib/password";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const currentPassword = String(body.currentPassword ?? "");
  const newPassword = String(body.newPassword ?? "");
  const rec = await prisma.user.findUnique({ where: { id: user.id } });
  if (!rec) return Response.json({ error: "Account not found." }, { status: 404 });
  if (!verifyPassword(currentPassword, rec.salt, rec.passwordHash)) {
    return Response.json({ error: "Current password is incorrect." }, { status: 400 });
  }
  if (!newPassword || newPassword.length < 6) {
    return Response.json({ error: "New password must be at least 6 characters." }, { status: 400 });
  }
  const { salt, hash } = hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { salt, passwordHash: hash, mustChangePassword: false } });
  return Response.json({ ok: true });
}
