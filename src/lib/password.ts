/*
 * Password hashing — byte-for-byte compatible with the legacy scrypt scheme
 * (crypto.scryptSync(password, salt, 32), 12-byte hex salt, 32-byte hex key),
 * so users migrated from data/db.json log in with their existing passwords.
 * Node crypto is used (no extra dependency); the API runs on Node only.
 */

import crypto from "crypto";

export function hashPassword(password: string, salt?: string): { salt: string; hash: string } {
  const s = salt ?? crypto.randomBytes(12).toString("hex");
  const hash = crypto.scryptSync(String(password), s, 32).toString("hex");
  return { salt: s, hash };
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  try {
    const candidate = crypto.scryptSync(String(password), salt, 32).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(hash));
  } catch {
    return false;
  }
}

export function randomToken(): string {
  return crypto.randomBytes(24).toString("hex");
}
