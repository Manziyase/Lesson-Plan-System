"use client";

/* Profile: account info (editable) + password change. */

import { useState } from "react";
import { api } from "@/lib/client";
import { useI18n, LangSelect } from "@/lib/i18n-client";
import { useMeta } from "@/components/Shell";
import { Chip, Modal, SectionTitle, useToast } from "@/components/ui";
import { Icon } from "@/components/icons";

export default function ProfilePage() {
  const { t, lang, setLang } = useI18n();
  const { meta, refresh } = useMeta();
  const toast = useToast();
  const me = meta.me;

  const [pwError, setPwError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(me.name);
  const [subjects, setSubjects] = useState(me.subjects.join(", "));
  const [editError, setEditError] = useState("");

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPwError("");
    const fd = new FormData(e.currentTarget);
    const current = String(fd.get("current") || "");
    const next = String(fd.get("next") || "");
    const confirmPw = String(fd.get("confirm") || "");
    if (next !== confirmPw) {
      setPwError(t("New passwords do not match."));
      return;
    }
    try {
      await api("/api/auth/password", { method: "POST", body: { currentPassword: current, newPassword: next } });
      toast(t("Password updated."), "ok");
      e.currentTarget.reset();
    } catch (err) {
      setPwError((err as Error).message);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setEditError("");
    try {
      await api("/api/auth/profile", {
        method: "PUT",
        body: { name, language: lang, subjects: subjects.split(",").map((s) => s.trim()).filter(Boolean) },
      });
      toast(t("Profile updated."), "ok");
      setEditOpen(false);
      refresh();
    } catch (err) {
      setEditError((err as Error).message);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t("My Account")}</h1>
          <div className="sub">{t("Manage your login and see your teaching profile.")}</div>
        </div>
      </div>

      <div className="grid-auto">
        <div className="card">
          <SectionTitle icon="userCircle">{t("My profile")}</SectionTitle>
          <dl className="kv">
            <dt>{t("Name")}</dt><dd>{me.name}</dd>
            <dt>{t("Email")}</dt><dd>{me.email}</dd>
            <dt>{t("Role")}</dt><dd style={{ textTransform: "capitalize" }}>{me.role}</dd>
            <dt>{t("Language")}</dt><dd style={{ textTransform: "uppercase" }}>{me.language}</dd>
            <dt>{t("Subjects")}</dt>
            <dd>{me.subjects.length ? <span style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{me.subjects.map((s) => <Chip key={s} text={s} kind="area" />)}</span> : <span className="muted">—</span>}</dd>
            <dt>{t("Classes")}</dt>
            <dd>{me.classes.length ? <span style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{me.classes.map((c) => <Chip key={c} text={c} kind="class" />)}</span> : <span className="muted">—</span>}</dd>
          </dl>
          <div style={{ marginTop: 14 }}>
            <button className="btn" onClick={() => setEditOpen(true)}><Icon name="pencil" size={15} /> {t("Edit profile")}</button>
          </div>
        </div>

        <div className="card">
          <SectionTitle icon="lock">{t("Change password")}</SectionTitle>
          {pwError ? <div className="form-error">{pwError}</div> : null}
          <form onSubmit={changePassword}>
            <div style={{ marginBottom: 14 }}>
              <label className="field-label" htmlFor="pw-current">{t("Current password")}</label>
              <input className="input" id="pw-current" name="current" type="password" required autoComplete="current-password" />
            </div>
            <div className="form-grid-2" style={{ marginBottom: 14 }}>
              <div>
                <label className="field-label" htmlFor="pw-next">{t("New password")}</label>
                <input className="input" id="pw-next" name="next" type="password" required minLength={6} autoComplete="new-password" />
              </div>
              <div>
                <label className="field-label" htmlFor="pw-confirm">{t("Confirm new password")}</label>
                <input className="input" id="pw-confirm" name="confirm" type="password" required minLength={6} autoComplete="new-password" />
              </div>
            </div>
            <button className="btn btn-primary" type="submit"><Icon name="key" size={15} /> {t("Update password")}</button>
          </form>
        </div>
      </div>

      {editOpen ? (
        <Modal title={t("Edit profile")} onClose={() => setEditOpen(false)}>
          {editError ? <div className="form-error">{editError}</div> : null}
          <form onSubmit={saveProfile}>
            <div style={{ marginBottom: 14 }}>
              <label className="field-label" htmlFor="pf-name">{t("Full name")}</label>
              <input className="input" id="pf-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="field-label">{t("Language")}</label>
              <LangSelect value={lang} onChange={setLang} className="input" />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label className="field-label" htmlFor="pf-subjects">{t("Subjects")}</label>
              <input className="input" id="pf-subjects" value={subjects} placeholder={t("Mathematics, Physics")} onChange={(e) => setSubjects(e.target.value)} />
            </div>
            <div className="modal__actions">
              <button type="button" className="btn" onClick={() => setEditOpen(false)}>{t("Cancel")}</button>
              <button className="btn btn-primary" type="submit"><Icon name="check" size={15} /> {t("Save changes")}</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
