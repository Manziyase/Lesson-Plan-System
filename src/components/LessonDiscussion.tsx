"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useToast } from "@/components/ui";

type Comment = { id: string; parentId: string | null; kind: string; body: string; createdAt: string; author: { id: string; name: string; role: string } };
export function LessonDiscussion({ planId, isAdmin }: { planId: string; isAdmin: boolean }) {
  const toast = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [feedback, setFeedback] = useState("");
  const [replyParent, setReplyParent] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const load = () => api<{ comments: Comment[] }>(`/api/plans/${encodeURIComponent(planId)}/comments`).then((d) => setComments(d.comments)).catch((e) => toast((e as Error).message, "err"));
  useEffect(() => { void load(); }, [planId]);
  async function post(text: string, kind = "comment", parentId?: string) {
    try { await api(`/api/plans/${encodeURIComponent(planId)}/comments`, { method: "POST", body: { body: text, kind, parentId } }); if (parentId) { setReplyBody(""); setReplyParent(null); } else if (kind === "feedback") setFeedback(""); else setBody(""); await load(); }
    catch (e) { toast((e as Error).message, "err"); }
  }
  return <section className="card lesson-discussion"><h2>Lesson feedback & discussion</h2><p className="muted">Comments are attached to this lesson plan and do not change its approval status.</p>
    {comments.map((c) => <article key={c.id} className={`lesson-comment ${c.kind === "feedback" ? "feedback" : ""}`}><strong>{c.author.name}</strong><span className="comment-role">{c.kind === "feedback" ? "Administrator feedback" : c.author.role}</span><time>{new Date(c.createdAt).toLocaleString()}</time><p>{c.body}</p>{!c.parentId && <button className="btn btn-sm" onClick={() => setReplyParent(replyParent === c.id ? null : c.id)}>Reply</button>}{replyParent === c.id && <form onSubmit={(e) => { e.preventDefault(); void post(replyBody, "comment", c.id); }}><textarea className="input" rows={2} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} required /><button className="btn btn-sm btn-primary">Post reply</button></form>}</article>)}
    {isAdmin && <form onSubmit={(e) => { e.preventDefault(); void post(feedback, "feedback"); }}><label className="field-label">Administrator feedback</label><textarea className="input" rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Specific guidance or encouragement" required /><button className="btn btn-sm btn-accent">Add feedback</button></form>}
    <form onSubmit={(e) => { e.preventDefault(); void post(body); }}><label className="field-label">Comment</label><textarea className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment or question" required /><button className="btn btn-primary">Comment</button></form>
  </section>;
}
