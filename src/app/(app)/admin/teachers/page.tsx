"use client";

import { useEffect, useMemo, useState } from "react";
import { api, apiMaybe } from "@/lib/client";
import { useI18n } from "@/lib/i18n-client";
import { useMeta } from "@/components/Shell";
import { Chip, Modal, SectionTitle, useConfirm, useToast } from "@/components/ui";
import { Icon } from "@/components/icons";
import AssignmentEditor, { type AssignmentDraft } from "@/components/AssignmentEditor";

type Teacher = {
  id: string;
  name: string;
  email: string;
  role: string;
  subjects: string[];
  classes: string[];
  assignments: { classId: string; className: string; subjectId: string; subjectName: string }[];
};

/** Collapse the flat assignment list into one draft card per class. */
function draftsFromAssignments(assignments: Teacher["assignments"]): AssignmentDraft[] {
  const byClass = new Map<string, AssignmentDraft>();
  for (const a of assignments) {
    const existing = byClass.get(a.classId);
    if (existing) {
      if (!existing.subjectIds.includes(a.subjectId)) existing.subjectIds.push(a.subjectId);
    } else {
      byClass.set(a.classId, {
        classId: a.classId,
        className: a.className,
        subjectIds: [a.subjectId],
      });
    }
  }
  return Array.from(byClass.values()).sort((a, b) => a.className.localeCompare(b.className));
}

function draftsPayload(drafts: AssignmentDraft[]) {
  return drafts
    .map((d) => ({ classId: d.classId, subjectIds: d.subjectIds }))
    .filter((d) => d.subjectIds.length > 0);
}

export default function AdminTeachersPage() {
  const { t } = useI18n();
  const { meta, refresh } = useMeta();
  const toast = useToast();
  const confirm = useConfirm();
  const [error, setError] = useState("");
  const [editTeacher, setEditTeacher] = useState<Teacher | null>(null);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>(meta.subjects);
  const [draft, setDraft] = useState<AssignmentDraft[]>([]);

  useEffect(() => {
    setSubjects(meta.subjects);
  }, [meta.subjects]);

  // Refresh the authoritative subject list (also picks up edits made on the
  // Subjects page while this page was already open).
  useEffect(() => {
    (async () => {
      try {
        const res = await api<{ subjects: { id: string; name: string }[] }>("/api/school/subjects");
        setSubjects(res.subjects);
      } catch {
        /* offline — the meta list is still usable */
      }
    })();
  }, []);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    const role = String(fd.get("role") || "teacher");
    const assignments = draftsPayload(draft);
    if (role !== "admin" && !assignments.length) {
      setError(t("Choose at least one class and the subjects this teacher teaches in it."));
      return;
    }
    const res = await apiMaybe<{ teacher: { id: string; name: string } }>("/api/teachers", {
      method: "POST",
      body: {
        name: String(fd.get("name") || ""),
        email: String(fd.get("email") || ""),
        role,
        assignments,
      },
    });
    if (res.error) {
      setError(res.error);
      return;
    }
    toast(t("Teacher added. Initial password: changeme123"), "ok");
    form.reset();
    setDraft([]);
    refresh();
  }

  async function remove(teacher: Teacher) {
    const ok = await confirm(t("Remove {name}'s account? Their lesson plans stay in the archive.", { name: teacher.name }), t("Remove"));
    if (!ok) return;
    try {
      await api(`/api/teachers/${teacher.id}`, { method: "DELETE" });
      toast(t("Account removed."), "ok");
      refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  /* "Who teaches what": every explicit class + subject pair. */
  const pairs = useMemo(
    () =>
      meta.teachers.flatMap((teacher) =>
        teacher.assignments.map((a) => ({ ...a, teacherId: teacher.id, teacherName: teacher.name }))
      ),
    [meta.teachers]
  );

  function subjectNamesFor(teacher: Teacher) {
    return Array.from(new Set(teacher.assignments.map((a) => a.subjectName))).sort();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t("Teachers")}</h1>
          <div className="sub">{t("Staff accounts at {school}.", { school: meta.school?.name ?? "" })}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <SectionTitle icon="users">{t("Staff")}</SectionTitle>
        <div className="table-wrap">
          <table className="data-table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>{t("Name")}</th>
                <th>{t("Email")}</th>
                <th>{t("Role")}</th>
                <th>{t("Teaching assignments")}</th>
                <th aria-label={t("Actions")}></th>
              </tr>
            </thead>
            <tbody>
              {meta.teachers.map((u) => {
                const teacher = u as Teacher;
                const byClass = draftsFromAssignments(teacher.assignments);
                const names = subjectNamesFor(teacher);
                return (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 700 }}>
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        {u.name} {u.id === meta.me.id ? <Chip text={t("You")} kind="gray" /> : null}
                      </span>
                    </td>
                    <td>{u.email}</td>
                    <td>{u.role === "admin" ? <Chip text={t("Admin")} kind="warn" /> : <Chip text={t("Teacher")} kind="gray" />}</td>
                    <td>
                      {byClass.length ? (
                        <div className="assignment-summary">
                          {byClass.map((d) => (
                            <div key={d.classId} className="assignment-summary__row">
                              <Chip text={d.className} kind="class" />
                              <span className="assignment-summary__subjects">
                                {d.subjectIds
                                  .map((id) => subjects.find((s) => s.id === id)?.name ?? teacher.assignments.find((a) => a.subjectId === id)?.subjectName ?? "")
                                  .filter(Boolean)
                                  .join(", ")}
                              </span>
                            </div>
                          ))}
                          {names.length ? (
                            <span className="assignment-summary__total">
                              {t("{n} subject(s) across {m} class(es)", { n: names.length, m: byClass.length })}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <div className="row-actions">
                        <button className="btn btn-sm" onClick={() => setEditTeacher(teacher)} title={t("Edit")} aria-label={t("Edit")}><Icon name="pencil" size={14} /></button>
                        {u.id !== meta.me.id ? (
                          <button className="btn btn-sm btn-danger" onClick={() => remove(teacher)} title={t("Remove")} aria-label={t("Remove")}><Icon name="trash" size={14} /></button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <SectionTitle icon="userPlus">{t("Add teacher")}</SectionTitle>
        <p className="muted" style={{ fontSize: ".85rem", marginTop: -4 }}>
          {t("The new account starts with password")} <code>changeme123</code> {t("and must change it at first login.")}
        </p>
        {error ? <div className="form-error">{error}</div> : null}
        <form onSubmit={add}>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div>
              <label className="field-label" htmlFor="t-name">{t("Full name")}</label>
              <input className="input" id="t-name" name="name" required placeholder={t("e.g. Alice Mukamana")} />
            </div>
            <div>
              <label className="field-label" htmlFor="t-email">{t("Email")}</label>
              <input className="input" id="t-email" name="email" type="email" required placeholder="alice@school.rw" />
            </div>
            <div>
              <label className="field-label" htmlFor="t-role">{t("Role")}</label>
              <select className="input" id="t-role" name="role" style={{ maxWidth: 220 }}>
                <option value="teacher">{t("Teacher")}</option>
                <option value="admin">{t("Admin")}</option>
              </select>
            </div>
          </div>

          <AssignmentEditor
            classes={meta.classes}
            subjects={subjects}
            value={draft}
            onChange={setDraft}
          />

          <div style={{ marginTop: 16 }}>
            <button className="btn btn-primary" type="submit"><Icon name="userPlus" size={15} /> {t("Add teacher")}</button>
          </div>
        </form>
      </div>

      {editTeacher ? (
        <EditTeacherModal
          teacher={editTeacher}
          meta={meta}
          subjects={subjects}
          onClose={() => setEditTeacher(null)}
          onSaved={() => {
            setEditTeacher(null);
            refresh();
          }}
        />
      ) : null}

      {meta.teachers.length > 0 && meta.classes.length > 0 ? (
        <div className="card">
          <SectionTitle icon="school">{t("Who teaches what")}</SectionTitle>
          <p className="muted" style={{ fontSize: ".85rem", marginTop: -4 }}>
            {t("Every class shows exactly who teaches which subjects in it.")}
          </p>
          <div className="subject-class-grid">
            {meta.classes.map((cls) => {
              const covering = pairs.filter((p) => p.classId === cls.id);
              return (
                <div key={cls.id} className="subject-class-card">
                  <div className="subject-class-card__head">
                    <span className="subject-class-card__name">{cls.name}</span>
                    <span className="muted" style={{ fontSize: ".75rem" }}>
                      {t("{n} assignment(s)", { n: covering.length })}
                    </span>
                  </div>
                  {covering.length === 0 ? (
                    <p className="muted" style={{ margin: 0, fontSize: ".78rem" }}>{t("No teacher assigned.")}</p>
                  ) : (
                    <ul className="subject-class-card__list">
                      {covering.map((p) => (
                        <li key={`${p.teacherId}-${p.subjectId}`} className="subject-class-card__row">
                          <span className="subject-class-card__teacher">{p.subjectName}</span>
                          <span className="subject-class-card__subjects">
                            <span className="muted" style={{ fontSize: ".78rem" }}>{p.teacherName}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          <div className="subject-class-card" style={{ marginTop: 14 }}>
            <div className="subject-class-card__head">
              <span className="subject-class-card__name">{t("By subject")}</span>
              <span className="muted" style={{ fontSize: ".75rem" }}>{t("Which classes cover it")}</span>
            </div>
            {subjects.map((s) => {
              const covering = pairs.filter((p) => p.subjectId === s.id);
              return (
                <div key={s.id} className="subject-class-card__row" style={{ borderTop: "1px solid var(--color-border)" }}>
                  <span className="subject-class-card__teacher" style={{ fontWeight: 700 }}>{s.name}</span>
                  <span className="subject-class-card__subjects">
                    {covering.length === 0 ? (
                      <span className="muted" style={{ fontSize: ".78rem" }}>{t("No teacher assigned.")}</span>
                    ) : (
                      <span className="muted" style={{ fontSize: ".78rem" }}>
                        {covering.map((p) => `${p.className} — ${p.teacherName}`).join(" · ")}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );
}

function EditTeacherModal({ teacher, meta, subjects, onClose, onSaved }: { teacher: Teacher; meta: ReturnType<typeof useMeta>["meta"]; subjects: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<AssignmentDraft[]>(() => draftsFromAssignments(teacher.assignments));
  const isSelf = teacher.id === meta.me.id;

  return (
    <Modal title={`${t("Edit")} — ${teacher.name}`} onClose={onClose}>
      {error ? <div className="form-error">{error}</div> : null}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          const fd = new FormData(e.currentTarget);
          const role = isSelf ? teacher.role : String(fd.get("role") || teacher.role);
          const assignments = draftsPayload(draft);
          if (role !== "admin" && !assignments.length) {
            setError(t("Choose at least one class and the subjects this teacher teaches in it."));
            return;
          }
          try {
            await api(`/api/teachers/${teacher.id}`, {
              method: "PUT",
              body: {
                name: String(fd.get("name") || ""),
                email: String(fd.get("email") || ""),
                role,
                assignments,
              },
            });
            toast(t("Teacher updated."), "ok");
            onSaved();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <div className="form-grid-2" style={{ marginBottom: 14 }}>
          <div>
            <label className="field-label" htmlFor="te-name">{t("Full name")}</label>
            <input className="input" id="te-name" name="name" required defaultValue={teacher.name} />
          </div>
          <div>
            <label className="field-label" htmlFor="te-email">{t("Email")}</label>
            <input className="input" id="te-email" name="email" type="email" required defaultValue={teacher.email} />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label className="field-label" htmlFor="te-role">{t("Role")}</label>
          <select className="input" id="te-role" name="role" defaultValue={teacher.role} disabled={isSelf} style={{ maxWidth: 220 }}>
            <option value="teacher">{t("Teacher")}</option>
            <option value="admin">{t("Admin")}</option>
          </select>
          {isSelf ? <div className="field-hint">{t("You cannot change your own role.")}</div> : null}
        </div>

        <AssignmentEditor
          classes={meta.classes}
          subjects={subjects}
          value={draft}
          onChange={setDraft}
        />

        <div className="modal__actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn" onClick={onClose}>{t("Cancel")}</button>
          <button className="btn btn-primary" type="submit"><Icon name="check" size={15} /> {t("Save changes")}</button>
        </div>
      </form>
    </Modal>
  );
}
