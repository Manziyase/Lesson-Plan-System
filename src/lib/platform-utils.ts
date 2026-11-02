/*
 * Small shared helpers for /api/superadmin routes: safe body parsing,
 * primitive coercion and status constants. Keeping them here prevents
 * inconsistent validation across the platform endpoints.
 */

export const SCHOOL_STATUSES = ["pending", "active", "suspended", "deactivated"] as const;
export const USER_STATUSES = ["active", "disabled"] as const;
export const SUBSCRIPTION_STATUSES = [
  "trial",
  "active",
  "expired",
  "cancelled",
  "suspended",
] as const;
export const BILLING_CYCLES = ["monthly", "annual"] as const;
export const PAYMENT_STATUSES = ["recorded", "paid", "failed", "refunded"] as const;
export const ANNOUNCEMENT_AUDIENCES = ["all", "admins", "teachers", "schools"] as const;
export const ANNOUNCEMENT_STATUSES = ["draft", "published", "archived"] as const;

export function clean(v: unknown, max = 200): string {
  return String(v ?? "").trim().slice(0, max);
}

export function toInt(v: unknown, fallback = 0, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): number {
  const n = typeof v === "number" ? v : Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function toBool(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === 1 || v === "1") return true;
  if (v === "false" || v === 0 || v === "0") return false;
  return fallback;
}

export function parseDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseDateOnly(v: unknown): string {
  const s = clean(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

export function parseStringArray(v: unknown, maxItems = 50, maxLen = 120): string[] {
  if (!Array.isArray(v)) return [];
  return Array.from(
    new Set(
      v
        .map((x) => clean(x, maxLen))
        .filter(Boolean)
        .slice(0, maxItems)
    )
  );
}

export function parseJsonObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return parseJsonObject(body);
  } catch {
    return {};
  }
}

export function badRequest(message: string, errors?: string[]) {
  return Response.json({ error: message, ...(errors?.length ? { errors } : {}) }, { status: 400 });
}

export function notFound(message = "Not found.") {
  return Response.json({ error: message }, { status: 404 });
}

export function included<T extends readonly string[]>(list: T, value: unknown): value is T[number] {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

export function safeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function isHexColor(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}
