"use client";

/* Fetch + formatting helpers for the Super Admin console. Kept separate from
   the school `api()` helper because a 401 here must redirect to the platform
   login, never to a school workspace. */

type ApiOptions = { method?: string; body?: unknown; redirectOn401?: boolean };

export async function saApi<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method || "GET",
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  let data: { error?: string; errors?: string[] } & Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) {
    if (res.status === 401 && opts.redirectOn401 !== false) {
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/superadmin/login")) {
        window.location.href = "/superadmin/login";
      }
    }
    throw new Error(data.error || `Request failed (${res.status}).`);
  }
  return data as T;
}

export function fmtNumber(n: number | null | undefined): string {
  return new Intl.NumberFormat("en-US").format(Number(n || 0));
}

export function fmtMoney(n: number | null | undefined, currency = "RWF"): string {
  const value = Number(n || 0);
  if (currency === "RWF") return `${fmtNumber(value)} RWF`;
  return `${fmtNumber(value)} ${currency}`;
}

export function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v) : v;
  const diff = Date.now() - d.getTime();
  if (Number.isNaN(diff)) return "—";
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(d);
}

export function bytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] || "")
    .join("")
    .toUpperCase();
}
