/*
 * TOTP (RFC 6238) implemented with Node's crypto — no extra dependency.
 * Used only for Platform Admin multi-factor authentication. Secrets are
 * base32-encoded (authenticator-app compatible) and never leave the server
 * except in the one-time setup response for the signed-in admin.
 */

import crypto from "crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(bytes = 20): string {
  return base32Encode(crypto.randomBytes(bytes));
}

function counterBuffer(counter: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  return buf;
}

/** 6-digit code for a given secret and time (defaults to now). */
export function totpCode(secret: string, at: number = Date.now(), stepSeconds = 30, digits = 6): string {
  const key = base32Decode(secret);
  if (!key.length) return "";
  const counter = Math.floor(at / 1000 / stepSeconds);
  const digest = crypto.createHmac("sha1", key).update(counterBuffer(counter)).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/** Accept the current step and ±1 step (clock skew). */
export function verifyTotp(secret: string, code: string, window = 1): boolean {
  const clean = String(code ?? "").replace(/[\s-]/g, "");
  if (!secret || !/^\d{6}$/.test(clean)) return false;
  const expected = totpCode(secret);
  let ok = false;
  for (let i = -window; i <= window; i++) {
    const candidate = totpCode(secret, Date.now() + i * 30_000);
    if (
      candidate.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected)) &&
      candidate === clean
    ) {
      ok = true;
      break;
    }
  }
  return ok;
}

export function otpauthUrl(secret: string, email: string, issuer = "LessonHub"): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
