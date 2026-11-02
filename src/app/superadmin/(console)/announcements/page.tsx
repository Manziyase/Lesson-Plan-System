"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { Modal, Spinner, useConfirm, useToast } from "@/components/ui";
import { saApi, fmtDate, fmtDateTime, fmtNumber, timeAgo } from "@/lib/superadmin-client";
import { SaPageHeader, StatCard, StatusChip, SearchBox, Pagination } from "@/components/superadmin/ui";

type SchoolBrief = { id: string; name: string; code: string; status?: string };

type Announcement = {
  id: string;
  title: string;
  message: string;
  audience: string;
  status: string;
  publishAt: string | null;
  expiresAt: string | null;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  schools: SchoolBrief[];
};

type ListResponse = {
  announcements: Announcement[];
  schools: SchoolBrief[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  counts: Record<string, number>;
};

const AUDIENCES = [
  { value: "all", label: "Everyone (all schools)", hint: "Every administrator and teacher on the platform." },
  { value: "admins", label: "School administrators", hint: "Administrators in every school." },
  { value: "teachers", label: "Teachers", hint: "Teachers in every school." },
  { value: "schools", label: "Selected schools", hint: "Everyone in the schools you choose below." },
];

const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const EMPTY_FORM = {
  title: "",
  message: "",
  audience: "all",
  status: "draft",
  publishAt: "",
  expiresAt: "",
  schoolIds: [] as string[],
};

type Form = typeof EMPTY_FORM;

export default function AnnouncementsPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [audience, setAudience] = useState("");
  const [page, setPage] = useState(1);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [schoolFilter, setSchoolFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      if (audience) params.set("audience", audience);
      const res = await saApi<ListResponse>(`/api/superadmin/announcements?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load announcements.");
    } finally {
      setLoading(false);
    }
  }, [page, q, status, audience]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c = data?.counts ?? {};
    return {
      all: (c.draft ?? 0) + (c.published ?? 0) + (c.archived ?? 0),
      draft: c.draft ?? 0,
      published: c.published ?? 0,
      archived: c.archived ?? 0,
    };
  }, [data]);

  const schools = data?.schools ?? [];
  const filteredSchools = useMemo(() => {
    const needle = schoolFilter.trim().toLowerCase();
    if (!needle) return schools;
    return schools.filter(
      (s) => s.name.toLowerCase().includes(needle) || (s.code || "").toLowerCase().includes(needle)
    );
  }, [schools, schoolFilter]);

  function resetPageAnd(fn: () => void) {
    fn();
    setPage(1);
  }

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, schoolIds: [] });
    setSchoolFilter("");
    setOpen(true);
  }

  function openEdit(a: Announcement) {
    setEditing(a);
    setForm({
      title: a.title,
      message: a.message,
      audience: a.audience,
      status: a.status,
      publishAt: toLocalInput(a.publishAt),
      expiresAt: toLocalInput(a.expiresAt),
      schoolIds: a.schools.map((s) => s.id),
    });
    setSchoolFilter("");
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      toast("An announcement title is required.", "err");
      return;
    }
    if (!form.message.trim()) {
      toast("An announcement message is required.", "err");
      return;
    }
    if (form.audience === "schools" && form.schoolIds.length === 0) {
      toast("Choose at least one school for this audience.", "err");
      return;
    }
    const body = {
      title: form.title.trim(),
      message: form.message.trim(),
      audience: form.audience,
      status: form.status,
      publishAt: fromLocalInput(form.publishAt),
      expiresAt: fromLocalInput(form.expiresAt),
      schoolIds: form.audience === "schools" ? form.schoolIds : [],
    };
    setBusy(true);
    try {
      if (editing) {
        await saApi(`/api/superadmin/announcements/${editing.id}`, { method: "PATCH", body });
        toast("Announcement updated.", "ok");
      } else {
        await saApi("/api/superadmin/announcements", { method: "POST", body });
        toast(form.status === "published" ? "Announcement published." : "Announcement saved.", "ok");
      }
      setOpen(false);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save this announcement.", "err");
    } finally {
      setBusy(false);
    }
  }

  async function setStatusFor(a: Announcement, next: string) {
    const labels: Record<string, string> = {
      published: "publish",
      archived: "archive",
      draft: "move back to draft",
    };
    const ok = await confirm(
      `Are you sure you want to ${labels[next] ?? next} “${a.title}”?`,
      next === "published" ? "Publish" : next === "archived" ? "Archive" : "Move to draft"
    );
    if (!ok) return;
    try {
      await saApi(`/api/superadmin/announcements/${a.id}`, { method: "PATCH", body: { status: next } });
      toast(`Announcement ${next}.`, "ok");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not change this announcement.", "err");
    }
  }

  async function remove(a: Announcement) {
    const ok = await confirm(
      `Delete “${a.title}”? This permanently removes the announcement from every school. This cannot be undone.`,
      "Delete announcement"
    );
    if (!ok) return;
    try {
      await saApi(`/api/superadmin/announcements/${a.id}`, { method: "DELETE" });
      toast("Announcement deleted.", "ok");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete this announcement.", "err");
    }
  }

  function audienceLabel(a: Announcement): string {
    if (a.audience === "all") return "Everyone";
    if (a.audience === "admins") return "Administrators";
    if (a.audience === "teachers") return "Teachers";
    if (a.audience === "schools") {
      return a.schools.length <= 2
        ? a.schools.map((s) => s.name).join(", ") || "Selected schools"
        : `${a.schools.length} selected schools`;
    }
    return a.audience;
  }

  return (
    <div className="stack">
      <SaPageHeader
        title="Announcements"
        sub="Platform notices for every school, a chosen audience, or specific schools. Only published notices that are within their date window reach recipients."
        actions={
          <>
            <button className="btn btn-sm" onClick={() => load()} disabled={loading}>
              <Icon name="refresh" size={14} /> Refresh
            </button>
            <button className="btn btn-sm btn-primary" onClick={openNew}>
              <Icon name="plus" size={14} /> New announcement
            </button>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard icon="megaphone" label="All announcements" value={counts.all} sub="Drafts, published and archived" />
        <StatCard icon="send" label="Published" value={counts.published} tone="ok" sub="Visible to their audience" />
        <StatCard icon="fileText" label="Drafts" value={counts.draft} sub="Not visible to schools yet" />
        <StatCard icon="layers" label="Archived" value={counts.archived} sub="Kept for the record" />
      </div>

      <div className="filters">
        <div className="grow">
          <label className="field-label">Search</label>
          <SearchBox
            value={q}
            onChange={(v) => resetPageAnd(() => setQ(v))}
            placeholder="Title or message…"
          />
        </div>
        <div>
          <label className="field-label">Audience</label>
          <select
            className="input"
            value={audience}
            onChange={(e) => resetPageAnd(() => setAudience(e.target.value))}
          >
            <option value="">All audiences</option>
            {AUDIENCES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="sa-seg" role="group" aria-label="Filter announcements by status">
        {[{ value: "", label: "All", count: counts.all }, ...STATUSES.map((s) => ({ ...s, count: counts[s.value as keyof typeof counts] ?? 0 }))].map(
          (s) => (
            <button
              key={s.value || "all"}
              type="button"
              className={status === s.value ? "active" : ""}
              onClick={() => resetPageAnd(() => setStatus(s.value))}
            >
              {s.label} <span className="count">{fmtNumber(s.count)}</span>
            </button>
          )
        )}
      </div>

      {error ? <div className="form-error">{error}</div> : null}

      <section className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Announcement</th>
                <th>Audience</th>
                <th>Publish</th>
                <th>Expires</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td colSpan={6}>
                    <Spinner />
                  </td>
                </tr>
              ) : !data || data.announcements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="sa-empty-row">
                    No announcements match these filters.
                  </td>
                </tr>
              ) : (
                data.announcements.map((a) => (
                  <tr key={a.id}>
                    <td style={{ maxWidth: 420 }}>
                      <div className="sa-cell-main">
                        <strong className="sa-row-title">{a.title}</strong>
                        <span
                          style={{
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {a.message}
                        </span>
                        <span className="sa-row-sub">
                          {a.createdByName || "Super Admin"} · {timeAgo(a.createdAt)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="sa-cell-main">
                        <strong>{audienceLabel(a)}</strong>
                        {a.audience === "schools" && a.schools.length > 2 ? (
                          <span>{a.schools.slice(0, 2).map((s) => s.name).join(", ")} +{a.schools.length - 2}</span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <span className="sa-row-title">{a.publishAt ? fmtDate(a.publishAt) : "Not scheduled"}</span>
                      {a.publishAt ? <div className="sa-row-sub">{fmtDateTime(a.publishAt)}</div> : null}
                    </td>
                    <td>
                      <span className="sa-row-title">{a.expiresAt ? fmtDate(a.expiresAt) : "No expiry"}</span>
                    </td>
                    <td>
                      <StatusChip status={a.status} />
                    </td>
                    <td>
                      <div className="sa-table-actions">
                        {a.status === "published" ? (
                          <button className="btn btn-sm" onClick={() => setStatusFor(a, "archived")}>
                            <Icon name="layers" size={13} /> Archive
                          </button>
                        ) : (
                          <button className="btn btn-sm" onClick={() => setStatusFor(a, "published")}>
                            <Icon name="send" size={13} /> Publish
                          </button>
                        )}
                        <button className="btn btn-sm" onClick={() => openEdit(a)}>
                          <Icon name="pencil" size={13} /> Edit
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => remove(a)}>
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data ? (
          <div style={{ padding: "0 16px 14px" }}>
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
          </div>
        ) : null}
      </section>

      {open ? (
        <Modal
          title={editing ? "Edit announcement" : "New announcement"}
          onClose={() => setOpen(false)}
          maxWidth={720}
        >
          <form onSubmit={save} className="stack" style={{ gap: 14 }}>
            <div>
              <label className="field-label">Title</label>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                maxLength={140}
                required
              />
            </div>
            <div>
              <label className="field-label">Message</label>
              <textarea
                className="input"
                rows={5}
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                maxLength={8000}
                required
              />
              <p className="field-hint">
                Plain text. Recipients see this in their school workspace; no email is sent unless platform email is
                configured.
              </p>
            </div>
            <div className="sa-two">
              <div>
                <label className="field-label">Audience</label>
                <select
                  className="input"
                  value={form.audience}
                  onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}
                >
                  {AUDIENCES.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <p className="field-hint">{AUDIENCES.find((a) => a.value === form.audience)?.hint}</p>
              </div>
              <div>
                <label className="field-label">Status</label>
                <select
                  className="input"
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                >
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <p className="field-hint">
                  Drafts are not visible. Publishing now notifies recipients immediately.
                </p>
              </div>
            </div>

            {form.audience === "schools" ? (
              <div>
                <div className="sa-inline" style={{ marginBottom: 6 }}>
                  <label className="field-label" style={{ margin: 0 }}>
                    Schools ({form.schoolIds.length} selected)
                  </label>
                  <div className="sa-inline-end">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          schoolIds: Array.from(new Set([...f.schoolIds, ...filteredSchools.map((s) => s.id)])),
                        }))
                      }
                    >
                      Select all shown
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setForm((f) => ({ ...f, schoolIds: [] }))}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div style={{ marginBottom: 6 }}>
                  <SearchBox
                    value={schoolFilter}
                    onChange={setSchoolFilter}
                    placeholder="Filter schools…"
                    delay={0}
                  />
                </div>
                <div
                  className="card"
                  style={{ maxHeight: 220, overflowY: "auto", padding: "10px 12px" }}
                >
                  {filteredSchools.length === 0 ? (
                    <p className="muted" style={{ margin: 0 }}>
                      No schools match this filter.
                    </p>
                  ) : (
                    <div className="sa-chip-row" style={{ gap: 10 }}>
                      {filteredSchools.map((s) => (
                        <label key={s.id} className="sa-check">
                          <input
                            type="checkbox"
                            checked={form.schoolIds.includes(s.id)}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                schoolIds: e.target.checked
                                  ? Array.from(new Set([...f.schoolIds, s.id]))
                                  : f.schoolIds.filter((id) => id !== s.id),
                              }))
                            }
                          />
                          {s.name}
                          {s.code ? ` (${s.code})` : ""}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div className="sa-two">
              <div>
                <label className="field-label">Publish at</label>
                <input
                  className="input"
                  type="datetime-local"
                  value={form.publishAt}
                  onChange={(e) => setForm((f) => ({ ...f, publishAt: e.target.value }))}
                />
                <p className="field-hint">Leave empty to publish immediately when the status is Published.</p>
              </div>
              <div>
                <label className="field-label">Expires at</label>
                <input
                  className="input"
                  type="datetime-local"
                  value={form.expiresAt}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                />
                <p className="field-hint">Optional. After this time recipients no longer see the notice.</p>
              </div>
            </div>

            <div className="modal__actions">
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? <span className="sa-spin" /> : <Icon name="check" size={15} />}
                {form.status === "published" ? "Save & publish" : "Save announcement"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
