"use client";

/* Admin view: academic years — add, edit, activate. */

import { useCallback, useEffect, useState } from "react";
import { api, fmtDateShort } from "@/lib/client";
import { useI18n } from "@/lib/i18n-client";
import { useMeta } from "@/components/Shell";
import { Chip, Modal, SectionTitle, useToast } from "@/components/ui";
import { Icon } from "@/components/icons";

type Year = { id: string; label: string; startDate: string; endDate: string; terms: number[]; isActive: boolean };

export default function AdminYearsPage() {
  const { t, lang } = useI18n();
  const { refresh } = useMeta();
  const toast = useToast();
  const locale = lang === "rw" ? "rw-RW" : lang === "fr" ? "fr-FR" : "en-GB";
  const [years, setYears] = useState<Year[] | null>(null);
  const [error, setError] = useState("");
  const [editYear, setEditYear] = useState<Year | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ years: Year[] }>("/api/years");
      setYears(res.years);
    } catch (e) {
      setError((e as Error).message);
      setYears([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      await api("/api/years", {
        method: "POST",
        body: { label: String(fd.get("label") || ""), startDate: String(fd.get("start") || ""), endDate: String(fd.get("end") || "") },
      });
      toast(t("Academic year added."), "ok");
      e.currentTarget.reset();
      load();
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function activate(id: string) {
    try {
      await api(`/api/years/${id}`, { method: "PUT", body: { isActive: true } });
      toast(t("Active academic year updated."), "ok");
      load();
      refresh();
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{t("Academic Years")}</h1>
          <div className="sub">
            {t("Rwandan schools run three terms per year. The active year is what teachers plan in by default.")}
          </div>
        </div>
      </div>

      <div className="grid-auto">
        <div className="card">
          <SectionTitle icon="years">{t("Academic Years")}</SectionTitle>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("Year")}</th>
                  <th>{t("Start")}</th>
                  <th>{t("End")}</th>
                  <th>{t("Status")}</th>
                  <th aria-label={t("Actions")}></th>
                </tr>
              </thead>
              <tbody>
                {(years ?? []).map((y) => (
                  <tr key={y.id}>
                    <td style={{ fontWeight: 700 }}>{y.label}</td>
                    <td>{fmtDateShort(y.startDate, locale)}</td>
                    <td>{fmtDateShort(y.endDate, locale)}</td>
                    <td>{y.isActive ? <Chip text={t("Active")} kind="ok" /> : <Chip text="—" kind="gray" />}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <div className="row-actions">
                      <Icon name="eye" size={15} title={t("View")} aria-label={t("View")} />
                      <button className="btn btn-sm" onClick={() => setEditYear(y)} title={t("Edit")} aria-label={t("Edit")}><Icon name="pencil" size={14} /></button>
                      {!y.isActive ? (
                        <button className="btn btn-sm btn-primary" onClick={() => activate(y.id)} title={t("Set active")} aria-label={t("Set active")}><Icon name="check" size={14} /></button>
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
          <SectionTitle icon="plus">{t("New academic year")}</SectionTitle>
          {error ? <div className="form-error">{error}</div> : null}
          <form onSubmit={add}>
            <div style={{ marginBottom: 14 }}>
              <label className="field-label" htmlFor="year-label">{t("Year")}</label>
              <input className="input" id="year-label" name="label" placeholder="2027-2028" required />
              <div className="field-hint">{t("Format: starting year-ending year.")}</div>
            </div>
            <div className="form-grid-2" style={{ marginBottom: 14 }}>
              <div>
                <label className="field-label" htmlFor="year-start">{t("Start date")}</label>
                <input className="input" id="year-start" name="start" type="date" required />
              </div>
              <div>
                <label className="field-label" htmlFor="year-end">{t("End date")}</label>
                <input className="input" id="year-end" name="end" type="date" required />
              </div>
            </div>
            <button className="btn btn-primary" type="submit"><Icon name="plus" size={15} /> {t("Save")}</button>
          </form>
        </div>
      </div>

      {editYear ? (
        <Modal title={t("Academic year")} onClose={() => setEditYear(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              try {
                await api(`/api/years/${editYear.id}`, {
                  method: "PUT",
                  body: { label: String(fd.get("label") || ""), startDate: String(fd.get("start") || ""), endDate: String(fd.get("end") || "") },
                });
                toast(t("Academic year updated."), "ok");
                setEditYear(null);
                load();
                refresh();
              } catch (err) {
                toast((err as Error).message, "err");
              }
            }}
          >
            <div style={{ marginBottom: 14 }}>
              <label className="field-label" htmlFor="year-label-edit">{t("Year")}</label>
              <input className="input" id="year-label-edit" name="label" required defaultValue={editYear.label} />
            </div>
            <div className="form-grid-2" style={{ marginBottom: 14 }}>
              <div>
                <label className="field-label" htmlFor="year-start-edit">{t("Start date")}</label>
                <input className="input" id="year-start-edit" name="start" type="date" required defaultValue={editYear.startDate} />
              </div>
              <div>
                <label className="field-label" htmlFor="year-end-edit">{t("End date")}</label>
                <input className="input" id="year-end-edit" name="end" type="date" required defaultValue={editYear.endDate} />
              </div>
            </div>
            <div className="modal__actions">
              <button type="button" className="btn" onClick={() => setEditYear(null)}>{t("Cancel")}</button>
              <button className="btn btn-primary" type="submit"><Icon name="check" size={15} /> {t("Save changes")}</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
