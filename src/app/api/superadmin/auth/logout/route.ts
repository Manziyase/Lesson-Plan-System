import {
  destroyPlatformSession,
  getPlatformAdmin,
  PLATFORM_COOKIE,
} from "@/lib/platform-auth";
import { audit, requestMeta } from "@/lib/audit";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const admin = await getPlatformAdmin();
  const store = await cookies();
  const token = store.get(PLATFORM_COOKIE)?.value;
  await destroyPlatformSession(token);
  store.set(PLATFORM_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  });

  if (admin) {
    const meta = requestMeta(req);
    await audit({
      actorType: "platform_admin",
      actorId: admin.id,
      actorName: admin.name,
      actorEmail: admin.email,
      action: "auth.platform_logout",
      summary: "Super admin signed out",
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  return Response.json({ ok: true });
}
