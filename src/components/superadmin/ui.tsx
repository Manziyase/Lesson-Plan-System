"use client";

import React, { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { fmtNumber } from "@/lib/superadmin-client";

export function SaPageHeader({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {sub ? <p className="sub">{sub}</p> : null}
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
  accent,
}: {
  icon: IconName;
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "ok" | "warn";
  accent?: boolean;
}) {
  return (
    <div className={"stat" + (accent ? " accent" : "")}>
      <span className={"ico" + (tone ? " " + tone : "")} aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <div className="num">{typeof value === "number" ? fmtNumber(value) : value}</div>
      <div className="lbl">{label}</div>
      {sub ? <div className="sa-stat-sub">{sub}</div> : null}
    </div>
  );
}

const STATUS_TONE: Record<string, { kind: string; label: string }> = {
  active: { kind: "chip-ok", label: "Active" },
  paid: { kind: "chip-ok", label: "Paid" },
  published: { kind: "chip-ok", label: "Published" },
  trial: { kind: "chip-term", label: "Trial" },
  recorded: { kind: "chip-class", label: "Recorded" },
  draft: { kind: "chip-gray", label: "Draft" },
  archived: { kind: "chip-gray", label: "Archived" },
  disabled: { kind: "chip-warn", label: "Disabled" },
  pending: { kind: "chip-warn", label: "Pending approval" },
  suspended: { kind: "chip-warn", label: "Suspended" },
  deactivated: { kind: "chip-warn", label: "Deactivated" },
  cancelled: { kind: "chip-gray", label: "Cancelled" },
  expired: { kind: "chip-gray", label: "Expired" },
  failed: { kind: "chip-warn", label: "Failed" },
  refunded: { kind: "chip-gray", label: "Refunded" },
};

export function StatusChip({ status, label }: { status: string; label?: string }) {
  const tone = STATUS_TONE[status] ?? { kind: "chip-gray", label: status };
  return (
    <span className={"chip " + tone.kind}>
      {label ?? tone.label}
    </span>
  );
}

export function ChartCard({
  title,
  sub,
  action,
  children,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card sa-chart-card">
      <div className="sa-card-head">
        <div>
          <h3>{title}</h3>
          {sub ? <p>{sub}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Delta({ value }: { value: number }) {
  const up = value > 0;
  const flat = value === 0;
  return (
    <span className={"sa-delta" + (up ? " up" : flat ? " flat" : " down")}>
      {flat ? "±" : up ? "▲" : "▼"} {Math.abs(value)}%
      <span className="muted"> vs last month</span>
    </span>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder = "Search…",
  delay = 300,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  delay?: number;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (local !== value) onChange(local);
    }, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, delay]);
  return (
    <div className="sa-search">
      <Icon name="search" size={15} />
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {local ? (
        <button
          type="button"
          className="sa-search__clear"
          onClick={() => {
            setLocal("");
            onChange("");
          }}
          aria-label="Clear search"
        >
          <Icon name="x" size={13} />
        </button>
      ) : null}
    </div>
  );
}

export function Pagination({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  return (
    <div className="sa-pagination">
      <span className="muted">
        {fmtNumber(total)} {total === 1 ? "record" : "records"} · page {page} of {pages}
      </span>
      <div className="row-actions">
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <Icon name="chevronLeft" size={14} /> Previous
        </button>
        <button className="btn btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next <Icon name="chevronsRight" size={14} />
        </button>
      </div>
    </div>
  );
}

export function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="sa-info">
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}

export function SectionCard({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: IconName;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <div className="sa-card-head">
        <div className="sa-card-title">
          {icon ? (
            <span className="ico" aria-hidden="true">
              <Icon name={icon} size={16} />
            </span>
          ) : null}
          <h3>{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
