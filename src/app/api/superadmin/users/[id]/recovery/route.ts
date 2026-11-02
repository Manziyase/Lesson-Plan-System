import crypto from "crypto";
import { prisma } from "@/lib/db";
import { randomToken } from "@/lib/password";
import { getPlatformAdmin, platformUnauthorized } from "@/lib/platform-auth";
import { auditFromRequest } from "@/lib/audit";
import { notFound } from "@/lib/platform-utils";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const RECOVERY_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Issue a one-time password-recovery link for a school user. Only the SHA-256
 * hash is stored; the plain token is returned once to the super admin, who
 * must deliver it out-of-band. No password is ever displayed or reset here.
 */
export async function POST(req: Request, { params }: Params) {
  const admin = await getPlatformAdmin();
  if (!admin) return platformUnauthorized();
  const { id } = await params;

  const user = await prisma.user.findUnique({ where: { id }, include: { school: true } });
  if (!user) return notFound("User not found.");

  const token = randomToken();
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + RECOVERY_TTL_MS);

  await prisma.$transaction([
    prisma.recoveryToken.deleteMany({ where: { userId: id, usedAt: null } }),
    prisma.recoveryToken.create({
      data: {
        id: "rec_" + randomToken().slice(0, 18),
        userId: id,
        tokenHash,
        expiresAt,
        createdBy: admin.id,
      },
    }),
  ]);

  await auditFromRequest(req, admin, {
    action: "user.recovery_issued",
    targetType: "user",
    targetId: id,
    schoolId: user.schoolId,
    summary: `Issued a password recovery link for ${user.name} (${user.email})`,
    metadata: { expiresAt: expiresAt.toISOString(), schoolName: user.school.name },
  });

  return Response.json(
    {
      ok: true,
      link: `/recover/${token}`,
      token,
      expiresAt: expiresAt.toISOString(),
      user: { id: user.id, name: user.name, email: user.email },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
