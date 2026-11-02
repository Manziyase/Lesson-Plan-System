"use client";/* Typed fetch wrapper for client components (same-origin API). */
import { toUserError } from "./friendly-error";

export { toUserError };

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method || "GET",
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  let data: { error?: string } & Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) {
    if (res.status === 401) {
      // Session expired — hard redirect to login (mirrors legacy behaviour).
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    const user = toUserError(data);
    const err = new Error(user.message) as Error & { status: number; raw: unknown; userMessage: string; userCode: string };
    err.status = res.status;
    err.raw = data;
    err.userMessage = user.message;
    err.userCode = user.code;
    throw err;
  }
  return data as T;
}

/** Return a friendly message for a non-ok response instead of throwing. */
export async function apiMaybe<T>(path: string, opts?: Parameters<typeof api>[1]): Promise<{ data: T | null; error: string; code: string }> {
  try {
    return { data: await api<T>(path, opts), error: "", code: "ok" };
  } catch (e) {
    const err = e as { userMessage?: string; userCode?: string; message?: string };
    if (err && typeof err === "object" && typeof err.userMessage === "string") {
      return { data: null, error: err.userMessage, code: err.userCode ?? "unknown" };
    }
    return { data: null, error: err?.userMessage ?? err?.message ?? "Request failed", code: "unknown" };
  }
}

/* ---------- shared client helpers (ported from public/js/ui.js) ---------- */

export function initials(name: string): string {
  return String(name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();
}

export function fmtDate(iso: string | null | undefined, locale = "en-GB"): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtDateShort(iso: string | null | undefined, locale = "en-GB"): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function todayISO(): string {
  return new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
}

export function guessTerm(): 1 | 2 | 3 {
  const m = new Date().getMonth() + 1;
  return m >= 9 ? 1 : m >= 5 ? 3 : 2;
}
