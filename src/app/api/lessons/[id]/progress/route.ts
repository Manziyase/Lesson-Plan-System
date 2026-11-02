import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/session";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
export async function PATCH(req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const lesson = await prisma.lesson.findFirst({ where: { id, schoolId: user.schoolId } });
  if (!lesson) return Response.json({ error: "Lesson not found." }, { status: 404 });
  if (user.role !== "admin" && lesson.teacherId !== user.id) return Response.json({ error: "Only the lesson teacher or a school administrator can update delivery status." }, { status: 403 });
  let status = "";
  try { status = String((await req.json()).teachingStatus ?? ""); } catch { /* invalid */ }
  if (status !== "planned" && status !== "completed") return Response.json({ error: "Choose planned or completed." }, { status: 400 });
  const updated = await prisma.lesson.update({ where: { id }, data: { teachingStatus: status } as never });
  return Response.json({ teachingStatus: (updated as unknown as { teachingStatus: string }).teachingStatus });
}
