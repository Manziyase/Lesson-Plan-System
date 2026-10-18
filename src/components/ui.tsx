"use client";

/* Shared UI components — spinners, empty states, toasts, modals and
   confirmation dialogs, styled by the design system in globals.css. */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n-client";
import { Icon, type IconName } from "@/components/icons";

export function Chip({ text, kind }: { text: string; kind?: "term" | "ok" | "gray" | "class" | "area" | "warn" }) {
  return <span className={"chip" + (kind ? " chip-" + kind : "")}>{text}</span>;
}

export function TermChip({ term }: { term: number }) {
  const { t } = useI18n();
  return <Chip kind="term" text={t("Term {n}", { n: term })} />;
}

/** Section heading with an icon tile. */
export function SectionTitle({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <h2 className="section-title">
      <span className="ico" aria-hidden="true">
        <Icon name={icon} size={16} />
      </span>
      {children}
    </h2>
  );
}

export function Spinner() {
  const { t } = useI18n();
  return (
    <div className="loading" style={{ textAlign: "center", color: "var(--color-ink-3)", padding: 44 }} role="status" aria-live="polite">
      <div className="spinner" />
      {t("Loading…")}
    </div>
  );
}

export function EmptyState({ icon, title, sub, action }: { icon: IconName; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="ico" aria-hidden="true">
        <Icon name={icon} size={24} />
      </div>
      <h3>{title}</h3>
      {sub ? <p>{sub}</p> : null}
      {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
    </div>
  );
}

/* ---------- toasts ---------- */

type ToastKind = "ok" | "err" | undefined;
type ToastItem = { id: number; msg: string; kind: ToastKind };
const ToastCtx = createContext<{ toast: (msg: string, kind?: ToastKind) => void }>({ toast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const toast = useCallback((msg: string, kind?: ToastKind) => {
    const id = ++idRef.current;
    setToasts((ts) => [...ts, { id, msg, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 3600);
  }, []);
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div id="toast-container" aria-live="polite">
        {toasts.map((tt) => (
          <div key={tt.id} className={"toast" + (tt.kind ? " " + tt.kind : "")}>
            {tt.kind === "err" ? (
              <Icon name="xCircle" size={16} style={{ marginTop: 1 }} />
            ) : tt.kind === "ok" ? (
              <Icon name="checkCircle" size={16} style={{ marginTop: 1 }} />
            ) : (
              <Icon name="info" size={16} style={{ marginTop: 1 }} />
            )}
            <span>{tt.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx).toast;
}

/* ---------- modal ---------- */

export function Modal({ title, onClose, children, maxWidth }: { title: string; onClose: () => void; children: React.ReactNode; maxWidth?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={maxWidth ? { maxWidth } : undefined}>
        <button className="btn btn-sm btn-ghost modal__close" onClick={onClose} aria-label="Close">
          <Icon name="x" size={16} />
        </button>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/* ---------- confirmation dialog ---------- */

type ConfirmRequest = { message: string; confirmLabel: string; resolve: (ok: boolean) => void };
const ConfirmCtx = createContext<{ confirm: (message: string, confirmLabel?: string) => Promise<boolean> }>({
  confirm: () => Promise.resolve(false),
});

/**
 * Confirmation dialog provider. Replaces window.confirm with an accessible,
 * branded modal. `useConfirm()` returns an async function — await it:
 *   if (!(await confirm("Delete?"))) return;
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [req, setReq] = useState<ConfirmRequest | null>(null);

  const confirm = useCallback(
    (message: string, confirmLabel?: string) =>
      new Promise<boolean>((resolve) => {
        setReq({ message, confirmLabel: confirmLabel ?? t("Delete"), resolve });
      }),
    [t]
  );

  function answer(ok: boolean) {
    req?.resolve(ok);
    setReq(null);
  }

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") answer(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  return (
    <ConfirmCtx.Provider value={{ confirm }}>
      {children}
      {req ? (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && answer(false)}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-label={req.message} style={{ maxWidth: 420 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span
                aria-hidden="true"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  display: "grid",
                  placeItems: "center",
                  flex: "0 0 38px",
                  background: "var(--color-warning-soft)",
                  color: "var(--color-warning)",
                }}
              >
                <Icon name="warning" size={20} />
              </span>
              <p style={{ margin: 0, fontSize: ".92rem", lineHeight: 1.5 }}>{req.message}</p>
            </div>
            <div className="modal__actions">
              <button className="btn" onClick={() => answer(false)}>{t("Cancel")}</button>
              <button className="btn btn-primary" autoFocus onClick={() => answer(true)}>{req.confirmLabel}</button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmCtx).confirm;
}

/* ---------- print header (legacy parity) ---------- */

export function setPrintHeader(school: string, lines: string[]) {
  const h = document.getElementById("print-header");
  if (!h) return;
  const schoolEl = h.querySelector(".print-school");
  const metaEl = h.querySelector(".print-meta");
  if (schoolEl) schoolEl.textContent = school || "";
  if (metaEl) metaEl.textContent = (lines || []).join("  •  ");
}
