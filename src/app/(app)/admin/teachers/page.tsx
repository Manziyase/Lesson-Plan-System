"use client";

/* Admin view: teacher accounts — add, edit and remove staff accounts. */

import { useState } from "react";
import { api } from "@/lib/client";
import { useI18n } from "@/lib/i18n-client";
import { useMeta } from "@/components/Shell";
import { Chip, Modal, SectionTitle, useConfirm, useToast } from "@/components/ui";
import { Icon } from "@/components/icons";

type Teacher = { id: string; name: string; email: string; role: string; subjects: string[]; classes: string[] };

export default function AdminTeachersPage() {
  const { t } = useI18n();
  const { meta, refresh } = useMeta();
  const toast = useToast();
  const confirm = useConfirm();
  const [error, setError] = useState("");
  const [editTeacher, setEditTeacher] = useState<Teacher | null>(null);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    const classes = Array.from(e.currentTarget.querySelectorAll<HTMLInputElement>('input[name="t-class"]:checked')).map((c) => c.value);
    try {
      await api("/api/teachers", {
        method: "POST",
        body: {
          name: String(fd.get("name") || ""),
          email: String(fd.get("email") || ""),
          role: String(fd.get("role") || "teacher"),
          subjects: String(fd.get("subjects") || "").split(",").map((s) => s.trim()).filter(Boolean),
          classes,
        },
      });
      toast(t("Teacher added. Initial password: changeme123"), "ok");
      e.currentTarget.reset();
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(teacher: Teacher) {
    const ok = await confirm(
      t("Remove {name}'s account? Their lesson plans stay in the archive.", { name: teacher.name }),
      t("Remove")
    );
    if (!ok) return;
    try {
      await api(`/api/teachers/${teacher.id}`, { method: "DELETE" });
      toast(t("Account removed."), "ok");
      refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    }
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
          <table className="data-table" style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th>{t("Name")}</th>
                <th>{t("Email")}</th>
                <th>{t("Role")}</th>
                <th>{t("Subjects")}</th>
                <th>{t("Classes")}</th>
                <th aria-label={t("Actions")}></th>
              </tr>
            </thead>
            <tbody>
              {meta.teachers.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 700 }}>
                    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {u.name} {u.id === meta.me.id ? <Chip text={t("You")} kind="gray" /> : null}
                    </span>
                  </td>
                  <td>{u.email}</td>
                  <td>
                    {u.role === "admin" ? <Chip text={t("Admin")} kind="warn" /> : <Chip text={t("Teacher")} kind="gray" />}
                  </td>
                  <td>
                    {u.subjects.length ? <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{u.subjects.map((s) => <Chip key={s} text={s} kind="area" />)}</span> : <span className="muted">—</span>}
                  </td>
                  <td>
                    {u.classes.length ? <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{u.classes.map((c) => <Chip key={c} text={c} kind="class" />)}</span> : <span className="muted">—</span>}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <div className="row-actions">
                      <button className="btn btn-sm" onClick={() => setEditTeacher(u)}><Icon name="pencil" size={14} /> {t("Edit")}</button>
                      {u.id !== meta.me.id ? (
                        <button className="btn btn-sm btn-danger" onClick={() => remove(u)}><Icon name="trash" size={14} /> {t("Remove")}</button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
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
              <label className="field-label" htmlFor="t-subjects">{t("Subjects")}</label>
              <input className="input" id="t-subjects" name="subjects" placeholder={t("Mathematics, Physics")} />
            </div>
            <div>
              <label className="field-label" htmlFor="t-role">{t("Role")}</label>
              <select className="input" id="t-role" name="role" style={{ maxWidth: 220 }}>
                <option value="teacher">{t("Teacher")}</option>
                <option value="admin">{t("Admin")}</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <span className="field-label">{t("Classes")}</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 130, overflow: "auto" }}>
              {meta.classes.map((c) => (
                <label key={c.id} className="check-pill">
                  <input type="checkbox" name="t-class" value={c.name} /> {c.name}
                </label>
              ))}
            </div>
          </div>
          <button className="btn btn-primary" type="submit"><Icon name="userPlus" size={15} /> {t("Add teacher")}</button>
        </form>
      </div>

      {editTeacher ? (
        <EditTeacherModal
          teacher={editTeacher}
          meta={meta}
          onClose={() => setEditTeacher(null)}
          onSaved={() => {
            setEditTeacher(null);
            refresh();
          }}
        />
      ) : null}
    </>
  );
}

function EditTeacherModal({ teacher, meta, onClose, onSaved }: { teacher: Teacher; meta: ReturnType<typeof useMeta>["meta"]; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [error, setError] = useState("");
  const isSelf = teacher.id === meta.me.id;

  return (
    <Modal title={`${t("Edit")} — ${teacher.name}`} onClose={onClose}>
      {error ? <div className="form-error">{error}</div> : null}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const role = isSelf ? teacher.role : String(fd.get("role") || teacher.role);
          try {
            await api(`/api/teachers/${teacher.id}`, {
              method: "PUT",
              body: {
                name: String(fd.get("name") || ""),
                email: String(fd.get("email") || ""),
                role,
                subjects: String(fd.get("subjects") || "").split(",").map((s) => s.trim()).filter(Boolean),
                classes: Array.from(e.currentTarget.querySelectorAll<HTMLInputElement>('input[name="te-class"]:checked')).map((c) => c.value),
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
        <div style={{ marginBottom: 14 }}>
          <label className="field-label" htmlFor="te-subjects">{t("Subjects")}</label>
          <input className="input" id="te-subjects" name="subjects" defaultValue={teacher.subjects.join(", ")} placeholder={t("Mathematics, Physics")} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <span className="field-label">{t("Classes")}</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 140, overflow: "auto" }}>
            {meta.classes.map((c) => (
              <label key={c.id} className="check-pill">
                <input type="checkbox" name="te-class" value={c.name} defaultChecked={teacher.classes.includes(c.name)} /> {c.name}
              </label>
            ))}
          </div>
        </div>
        <div className="modal__actions">
          <button type="button" className="btn" onClick={onClose}>{t("Cancel")}</button>
          <button className="btn btn-primary" type="submit"><Icon name="check" size={15} /> {t("Save changes")}</button>
        </div>
      </form>
    </Modal>
  );
}
