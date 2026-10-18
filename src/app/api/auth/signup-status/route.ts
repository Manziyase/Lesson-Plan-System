import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Signup is open only while the installation has no school yet. */
export async function GET() {
  const schools = await prisma.school.count();
  return Response.json({ open: schools === 0 });
}
