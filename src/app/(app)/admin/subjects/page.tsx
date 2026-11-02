"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n-client";
import { useMeta } from "@/components/Shell";
import { SectionTitle, useConfirm, useToast } from "@/components/ui";
import { Icon } from "@/components/icons";

type Subject = { id: string; name: string };

export default function AdminSubjectsPage() {
  const { t } = useI18n();
  const { meta, refresh } = useMeta();
  const toast = useToast();
  const confirm = useConfirm();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [add, setAdd] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editingName, setEditingName] = useState("");

  async function load() {
    try {
      const res = await api<{ subjects: Subject[] }>("/api/school/subjects");
      setSubjects(res.subjects);
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setError("");
    setBusy(true);
    try {
      await api("/api/school/subjects", { method: "POST", body: { name: add } });
      setAdd("");
      toast(t("Subject added."), "ok");
      load();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function rename(id: string) {
    setError("");
    setBusy(true);
    try {
      await api(`/api/school/subjects/${id}`, { method: "PUT", body: { name: editingName } });
      toast(t("Subject renamed. Existing assignments and plans keep working."), "ok");
      setEditingId("");
      setEditingName("");
      load();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function remove(id: string, name: string) {
    const ok = await confirm(t("Remove {name}?", { name }));
    if (!ok) return;
    try {
      await api(`/api/school/subjects/${id}`, { method: "DELETE" });
      toast(t("Subject removed."), "ok");
      load();
      refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  // Usage counts from the live assignment data in meta.
  function teacherCount(subjectId: string) {
    return meta.teachers.filter((u) => u.assignments.some((a) => a.subjectId === subjectId)).length;
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t("Subjects")}</h1>
          <div className="sub">{t("The single source of truth for learning areas across planning and teacher assignments.")}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <SectionTitle icon="school">{t("Manage subjects")}</SectionTitle>
        {error ? <div className="form-error">{error}</div> : null}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          <div style={{ flex: "1 1 240px" }}>
            <label className="field-label" htmlFor="sub-add">{t("Subject name")}</label>
            <input
              className="input"
              id="sub-add"
              value={add}
              placeholder={t("e.g. Kiswahili")}
              onChange={(e) => setAdd(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && add.trim() && !busy) {
                  e.preventDefault();
                  save();
                }
              }}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={busy || !add.trim()}
          >
            <Icon name="plus" size={15} /> {busy ? t("Saving…") : t("Add subject")}
          </button>
        </div>
        <div className="muted" style={{ fontSize: ".8rem", marginTop: 8 }}>
          {t("Subjects added here appear immediately in teacher assignments and the Daily Plan learning-area dropdown.")}
        </div>
      </div>

      <div className="card">
        <SectionTitle icon="fileText">{t("Subject list")}</SectionTitle>
        {subjects.length === 0 ? (
          <p className="muted">{t("No subjects configured. Add one above.")}</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table" style={{ minWidth: 520 }}>
              <thead>
                <tr>
                  <th>{t("Subject")}</th>
                  <th>{t("Teachers")}</th>
                  <th aria-label={t("Actions")}></th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 700 }}>
                      {editingId === s.id ? (
                        <input
                          className="input"
                          value={editingName}
                          autoFocus
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              if (editingName.trim() && !busy) rename(s.id);
                            }
                            if (e.key === "Escape") {
                              setEditingId("");
                              setEditingName("");
                            }
                          }}
                        />
                      ) : (
                        s.name
                      )}
                    </td>
                    <td>{teacherCount(s.id)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span className="row-actions">
                        {editingId === s.id ? (
                          <>
                            <button className="btn btn-sm btn-primary" onClick={() => rename(s.id)} disabled={busy || !editingName.trim()} title={t("Save")} aria-label={t("Save")}><Icon name="check" size={15} /></button>
                            <button className="btn btn-sm" onClick={() => { setEditingId(""); setEditingName(""); }} title={t("Cancel")} aria-label={t("Cancel")}><Icon name="x" size={15} /></button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-sm" onClick={() => { setEditingId(s.id); setEditingName(s.name); setError(""); }} title={t("Rename")} aria-label={t("Rename")}><Icon name="pencil" size={15} /></button>
                            <button className="btn btn-sm btn-danger" onClick={() => remove(s.id, s.name)} title={t("Delete")} aria-label={t("Delete")}><Icon name="trash" size={15} /></button>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
