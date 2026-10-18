import { getSessionUser, publicUser, unauthorized } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return Response.json({ user: publicUser(user) });
}
