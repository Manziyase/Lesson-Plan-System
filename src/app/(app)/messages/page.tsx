"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { Spinner, useToast } from "@/components/ui";
import { useMeta } from "@/components/Shell";

type Person = { id: string; name: string; role: string; email?: string };
type Message = { id: string; threadId: string; senderId: string; recipientId: string; subject: string; body: string; readAt: string | null; createdAt: string; sender: Person; recipient: Person };
export default function MessagesPage() {
  const { meta } = useMeta();
  const toast = useToast();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [recipients, setRecipients] = useState<Person[]>([]);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [compose, setCompose] = useState(false);
  const [reply, setReply] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const load = useCallback(async () => { const r = await api<{ messages: Message[]; recipients: Person[] }>("/api/messages"); setMessages(r.messages); setRecipients(r.recipients); }, []);
  useEffect(() => { load().catch(() => setMessages([])); }, [load]);
  const threads = useMemo(() => {
    const grouped = new Map<string, Message[]>();
    for (const m of messages ?? []) grouped.set(m.threadId, [...(grouped.get(m.threadId) ?? []), m]);
    return [...grouped.entries()].map(([id, items]) => ({ id, items: items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)), latest: items.reduce((a, b) => a.createdAt > b.createdAt ? a : b) })).sort((a, b) => b.latest.createdAt.localeCompare(a.latest.createdAt)).filter((t) => `${t.latest.subject} ${t.latest.body} ${t.latest.sender.name} ${t.latest.recipient.name}`.toLowerCase().includes(query.toLowerCase()));
  }, [messages, query]);
  const current = threads.find((t) => t.id === selected);
  async function openThread(id: string) { setSelected(id); await api("/api/messages", { method: "PATCH", body: { threadId: id } }); await load(); }
  async function send(e: React.FormEvent) { e.preventDefault(); try { const recipientId = compose ? selected : current?.latest.senderId === meta.me.id ? current.latest.recipientId : current?.latest.senderId; await api("/api/messages", { method: "POST", body: { recipientId, threadId: compose ? undefined : selected, subject: compose ? subject : current?.latest.subject, body: compose ? body : reply } }); setBody(""); setReply(""); setSubject(""); setCompose(false); setSelected(""); await load(); } catch (err) { toast((err as Error).message, "err"); } }
  if (!messages) return <Spinner />;
  return <><div className="page-header"><div><h1>Messages</h1><div className="sub">Private conversations within {meta.school?.name}.</div></div><button className="btn btn-primary" onClick={() => { setSelected(""); setCompose(true); }}>New message</button></div>
    <div className="messages-layout"><section className="card messages-list"><input className="input" placeholder="Search conversations" value={query} onChange={(e) => setQuery(e.target.value)} />{threads.map((t) => <button key={t.id} className={`message-thread ${selected === t.id ? "active" : ""}`} onClick={() => openThread(t.id)}><strong>{t.latest.subject || "Message"}</strong><small>{t.latest.senderId === meta.me.id ? `To ${t.latest.recipient.name}` : t.latest.sender.name}</small><span>{t.latest.body.slice(0, 90)}</span></button>)}{!threads.length && <p className="muted">No conversations yet.</p>}</section>
    <section className="card message-view">{compose ? <form onSubmit={send}><h2>New message</h2><label className="field-label">Recipient</label><select className="input" required value={selected} onChange={(e) => setSelected(e.target.value)}><option value="">Choose colleague</option>{recipients.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select><label className="field-label">Subject</label><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={160} /><label className="field-label">Message</label><textarea className="input" rows={6} value={body} onChange={(e) => setBody(e.target.value)} required /><button className="btn btn-primary" type="submit">Send</button></form> : current ? <><h2>{current.latest.subject || "Conversation"}</h2><div className="message-history">{current.items.map((m) => <article key={m.id} className="message-bubble"><strong>{m.sender.name}</strong><small>{new Date(m.createdAt).toLocaleString()}</small><p>{m.body}</p></article>)}</div><form onSubmit={send}><textarea className="input" rows={3} placeholder="Write a reply" value={reply} onChange={(e) => setReply(e.target.value)} required /><button className="btn btn-primary" type="submit">Reply</button></form></> : <p className="muted">Choose a conversation or start a new message.</p>}</section></div></>;
}
