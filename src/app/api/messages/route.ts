import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/session";
import { randomToken } from "@/lib/password";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const messages = await prisma.message.findMany({
    where: { schoolId: user.schoolId, OR: [{ senderId: user.id }, { recipientId: user.id }] },
    include: { sender: { select: { id: true, name: true, role: true } }, recipient: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: "desc" }, take: 500,
  });
  const unread = await prisma.message.count({ where: { recipientId: user.id, schoolId: user.schoolId, readAt: null } });
  const recipients = await prisma.user.findMany({ where: { schoolId: user.schoolId, status: "active", id: { not: user.id } }, select: { id: true, name: true, role: true, email: true }, orderBy: { name: "asc" } });
  return Response.json({ messages, unread, recipients });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid message." }, { status: 400 }); }
  const text = typeof body.body === "string" ? body.body.trim().slice(0, 10000) : "";
  const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 160) : "";
  const recipientId = typeof body.recipientId === "string" ? body.recipientId : "";
  const threadId = typeof body.threadId === "string" && body.threadId ? body.threadId : `thread_${randomToken()}`;
  if (!text) return Response.json({ error: "Write a message before sending." }, { status: 400 });
  const recipient = await prisma.user.findFirst({ where: { id: recipientId, schoolId: user.schoolId, status: "active" } });
  if (!recipient || recipient.id === user.id) return Response.json({ error: "Choose an active colleague in your school." }, { status: 400 });
  if (body.threadId) {
    const exists = await prisma.message.findFirst({ where: { threadId, schoolId: user.schoolId, OR: [{ senderId: user.id }, { recipientId: user.id }] } });
    if (!exists) return Response.json({ error: "Conversation not found." }, { status: 404 });
    if (recipient.id !== exists.senderId && recipient.id !== exists.recipientId) return Response.json({ error: "Reply recipient must belong to this conversation." }, { status: 403 });
  }
  const message = await prisma.message.create({ data: { id: `msg_${randomToken()}`, threadId, schoolId: user.schoolId, senderId: user.id, recipientId: recipient.id, subject, body: text } });
  await prisma.notification.create({ data: { id: `ntf_${randomToken()}`, schoolId: user.schoolId, userId: recipient.id, kind: "message", targetId: threadId, body: subject || text.slice(0, 180) } });
  return Response.json({ message }, { status: 201 });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  let threadId = "";
  try { threadId = String((await req.json()).threadId ?? ""); } catch { /* invalid body */ }
  if (!threadId) return Response.json({ error: "Conversation is required." }, { status: 400 });
  const thread = await prisma.message.findFirst({ where: { threadId, schoolId: user.schoolId, OR: [{ senderId: user.id }, { recipientId: user.id }] } });
  if (!thread) return Response.json({ error: "Conversation not found." }, { status: 404 });
  await prisma.message.updateMany({ where: { threadId, schoolId: user.schoolId, recipientId: user.id, readAt: null }, data: { readAt: new Date() } });
  await prisma.notification.updateMany({ where: { userId: user.id, schoolId: user.schoolId, targetId: threadId, readAt: null }, data: { readAt: new Date() } });
  return Response.json({ ok: true });
}
