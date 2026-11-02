import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const notifications = await prisma.notification.findMany({ where: { userId: user.id, schoolId: user.schoolId }, orderBy: { createdAt: "desc" }, take: 100 });
  return Response.json({ notifications, unread: notifications.filter((n) => !n.readAt).length });
}
export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  let id = "";
  try { id = String((await req.json()).id ?? ""); } catch { /* invalid */ }
  if (id) await prisma.notification.updateMany({ where: { id, userId: user.id, schoolId: user.schoolId, readAt: null }, data: { readAt: new Date() } });
  else await prisma.notification.updateMany({ where: { userId: user.id, schoolId: user.schoolId, readAt: null }, data: { readAt: new Date() } });
  return Response.json({ ok: true });
}
