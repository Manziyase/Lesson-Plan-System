/*
 * Audit trail helper. Every platform-admin action and every security-relevant
 * school event goes through here. Metadata must never contain passwords,
 * hashes, session tokens, MFA secrets or recovery tokens.
 */

import { prisma } from "./db";
import { randomToken } from "./password";

export type AuditInput = {
  actorType?: "platform_admin" | "school_user" | "system";
  actorId?: string;
  actorName?: string;
  actorEmail?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  schoolId?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
};

export function requestMeta(req: Request): { ip: string; userAgent: string } {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0].trim() : "") || req.headers.get("x-real-ip") || "unknown";
  const userAgent = (req.headers.get("user-agent") || "").slice(0, 400);
  return { ip, userAgent };
}

export async function audit(entry: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        id: "log_" + randomToken().slice(0, 18),
        actorType: entry.actorType ?? "platform_admin",
        actorId: entry.actorId ?? "",
        actorName: entry.actorName ?? "",
        actorEmail: entry.actorEmail ?? "",
        action: entry.action,
        targetType: entry.targetType ?? "",
        targetId: entry.targetId ?? "",
        schoolId: entry.schoolId ?? "",
        summary: entry.summary ?? "",
        metadata: JSON.stringify(entry.metadata ?? {}),
        ip: entry.ip ?? "",
        userAgent: entry.userAgent ?? "",
      },
    });
  } catch (err) {
    // Audit failures must never break the operation the admin requested.
    console.error("audit log write failed", err);
  }
}

export function auditFromRequest(
  req: Request,
  admin: { id: string; name: string; email: string },
  entry: Omit<AuditInput, "actorId" | "actorName" | "actorEmail" | "ip" | "userAgent">
): Promise<void> {
  const meta = requestMeta(req);
  return audit({
    ...entry,
    actorType: "platform_admin",
    actorId: admin.id,
    actorName: admin.name,
    actorEmail: admin.email,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}
