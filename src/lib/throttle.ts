/*
 * Login throttling per IP — ported from the legacy server (12 attempts per
 * 15 minutes per address). Kept in-process; sufficient for single-school
 * deployments and identical in behaviour to the original.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 12;

type Rec = { count: number; first: number };
const attempts = new Map<string, Rec>();

export function throttleCheck(ip: string): boolean {
  const rec = attempts.get(ip);
  if (!rec) return true;
  if (Date.now() - rec.first > WINDOW_MS) {
    attempts.delete(ip);
    return true;
  }
  return rec.count < MAX_ATTEMPTS;
}

export function throttleRecord(ip: string, ok: boolean): void {
  const rec = attempts.get(ip) ?? { count: 0, first: Date.now() };
  if (Date.now() - rec.first > WINDOW_MS) {
    rec.count = 0;
    rec.first = Date.now();
  }
  rec.count = ok ? 0 : rec.count + 1;
  attempts.set(ip, rec);
}
