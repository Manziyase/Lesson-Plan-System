/*
 * Registration validation — shared by POST /api/auth/register so the rules
 * live in one place. Every field is trimmed and capped in length; optional
 * fields stay optional on the server too (the form labels them "(optional)").
 */

import { prisma } from "./db";
import { EMAIL_RE } from "./util";

export const SCHOOL_LEVELS = ["nursery", "primary", "secondary", "combined"] as const;
export const OWNERSHIP_TYPES = ["public", "aided", "private"] as const;

export type SchoolLevel = (typeof SCHOOL_LEVELS)[number];
export type OwnershipType = (typeof OWNERSHIP_TYPES)[number];

/** Loose E.164-ish phone check: +country code or 0-prefixed local, 7–15 digits. */
const RE_PHONE = /^\+?[0-9][0-9\s()-]{6,19}$/;

export function isSchoolLevel(v: unknown): v is SchoolLevel {
  return typeof v === "string" && (SCHOOL_LEVELS as readonly string[]).includes(v);
}

export function isOwnership(v: unknown): v is OwnershipType {
  return typeof v === "string" && (OWNERSHIP_TYPES as readonly string[]).includes(v);
}

export function isPhone(v: unknown): v is string {
  return RE_PHONE.test(String(v ?? "").trim());
}

/** Password must be at least 8 chars with a letter and a digit. */
export function isStrongPassword(v: unknown): v is string {
  const s = String(v ?? "");
  return s.length >= 8 && /[A-Za-z]/.test(s) && /[0-9]/.test(s);
}

export function isEmailFormat(v: unknown): v is string {
  return EMAIL_RE.test(String(v ?? "").trim());
}

/** Case-insensitive duplicate email check (SQLite has no CI equality). */
export async function emailTaken(email: string): Promise<boolean> {
  const exact = await prisma.user.findUnique({ where: { email } });
  if (exact) return true;
  const all = await prisma.user.findMany({ where: { email: { not: "" } }, select: { email: true } });
  return all.some((u) => u.email.toLowerCase() === email.toLowerCase());
}

/**
 * Duplicate-school check: same official name in the same district (any
 * ownership) or the same registration code. Both comparisons are
 * case-insensitive; empty district means name alone must be unique.
 */
export async function schoolAlreadyRegistered(
  name: string,
  district: string,
  code: string
): Promise<string | null> {
  const schools = await prisma.school.findMany({
    select: { name: true, district: true, code: true },
  });
  for (const s of schools) {
    if (code && s.code && s.code.toLowerCase() === code.toLowerCase()) {
      return "A school with this registration code is already registered.";
    }
    if (
      s.name.toLowerCase() === name.toLowerCase() &&
      (!s.district || !district || s.district.toLowerCase() === district.toLowerCase())
    ) {
      return "A school with this name (in this district) is already registered.";
    }
  }
  return null;
}
