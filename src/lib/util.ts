/*
 * Shared helpers ported from server/util.js (legacy) so validation rules and
 * CBC level definitions behave identically in the Next.js backend.
 */

export const LEVELS: { id: string; name: string }[] = [
  { id: "N1", name: "Nursery 1" },
  { id: "N2", name: "Nursery 2" },
  { id: "N3", name: "Nursery 3" },
  { id: "P1", name: "P1" },
  { id: "P2", name: "P2" },
  { id: "P3", name: "P3" },
  { id: "P4", name: "P4" },
  { id: "P5", name: "P5" },
  { id: "P6", name: "P6" },
  { id: "S1", name: "S1" },
  { id: "S2", name: "S2" },
  { id: "S3", name: "S3" },
  { id: "S4", name: "S4" },
  { id: "S5", name: "S5" },
  { id: "S6", name: "S6" },
];

const LEVEL_ORDER: Record<string, number> = {};
LEVELS.forEach((l, i) => (LEVEL_ORDER[l.id] = i + 1));

export function nowISO(): string {
  return new Date().toISOString();
}

/** Today's date in Kigali time (CAT, UTC+2) as YYYY-MM-DD. */
export function todayKigali(): string {
  return new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
}

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(s: unknown): s is string {
  if (!RE_DATE.test(String(s ?? ""))) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Derive the level (e.g. "P5") from a class name like "P5A" or "Nursery 2B". */
export function levelOfName(name: unknown): string | null {
  const s = String(name ?? "").trim().toUpperCase().replace(/\s+/g, "");
  let m = s.match(/^NURSERY(\d)/);
  if (m) return "N" + m[1];
  m = s.match(/^([PS])(\d)/);
  if (m) return m[1] + m[2];
  return null;
}

/** Display name for a class: level + optional stream letter ("P5A", "Nursery 1B"). */
export function classDisplayName(level: string, stream: string | null | undefined): string {
  const l = LEVELS.find((x) => x.id === level);
  if (!l) return String(level ?? "");
  return l.name + (stream ? String(stream).toUpperCase() : "");
}

/** Human sortable key: Nursery before P1..P6 before S1..S6, then stream letter. */
export function classOrderKey(name: string, level?: string | null): string {
  const lv = level || levelOfName(name);
  const order = LEVEL_ORDER[lv ?? ""] ?? 99;
  const stream = String(name ?? "").trim().match(/([A-Za-z])$/) ?? ["", ""];
  return String(order).padStart(2, "0") + stream[1].toLowerCase() + " " + name.toLowerCase();
}

export function slugify(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/* ---------- JSON-array helpers (SQLite has no native arrays) ---------- */

export function parseStringArray(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function parseNumberArray(raw: string | null | undefined): number[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.map(Number) : [];
  } catch {
    return [];
  }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const TERMS = [1, 2, 3] as const;
