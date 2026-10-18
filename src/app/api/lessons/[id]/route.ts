import { prisma } from "@/lib/db";
import { getSessionUser, unauthorized } from "@/lib/session";
import { findSimilar } from "@/lib/plans";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/* GET /api/lessons/:id — readable across the school (knowledge sharing). */
export async function GET(req: Request, { params }: Params) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const lesson = await prisma.lesson.findUnique({ where: { id } });
  if (!lesson || lesson.schoolId !== user.schoolId) {
    return Response.json({ error: "Lesson not found." }, { status: 404 });
  }
  // Pending lessons stay private to their author until the admin approves.
  if (lesson.status !== "published" && lesson.teacherId !== user.id && user.role !== "admin") {
    return Response.json({ error: "Lesson not found." }, { status: 404 });
  }
  const similar = await findSimilar({ ...lesson });
  return Response.json({ lesson, similar });
}
