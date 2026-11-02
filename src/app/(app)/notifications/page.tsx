"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Spinner } from "@/components/ui";
type Notice = { id: string; kind: string; targetId: string; body: string; readAt: string | null; createdAt: string };
export default function NotificationsPage() {
  const [items, setItems] = useState<Notice[] | null>(null);
  const load = useCallback(() => api<{ notifications: Notice[] }>("/api/notifications").then((r) => setItems(r.notifications)), []);
  useEffect(() => { load().catch(() => setItems([])); }, [load]);
  async function markAll() { await api("/api/notifications", { method: "PATCH", body: {} }); await load(); }
  if (!items) return <Spinner />;
  return <><div className="page-header"><div><h1>Notifications</h1><div className="sub">Messages, lesson feedback, and revision requests.</div></div><button className="btn" onClick={() => void markAll()}>Mark all read</button></div><div className="card">{items.length ? items.map((n) => <div className={`notification-row ${n.readAt ? "" : "unread"}`} key={n.id}><div><strong>{n.kind.replaceAll("_", " ")}</strong><p>{n.body}</p><small>{new Date(n.createdAt).toLocaleString()}</small></div><Link className="btn btn-sm" href={n.kind === "message" ? "/messages" : `/plans/${encodeURIComponent(n.targetId)}`}>Open</Link></div>) : <p className="muted">You are all caught up.</p>}</div></>;
}
