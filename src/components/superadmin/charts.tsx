"use client";

/*
 * Lightweight SVG charts for the platform console — no chart dependency.
 * Colours come from the LessonHub CSS tokens so light/dark themes work.
 */

import React, { useId } from "react";

export type Point = { label: string; count: number };

const PALETTE = ["#16246E", "#C9A227", "#16A34A", "#D97706", "#DC2626", "#26378F"];

function niceMax(value: number): number {
  if (value <= 4) return 4;
  const step = Math.ceil(value / 4);
  return step * 4;
}

export function TrendChart({
  data,
  color = "var(--color-royal-600)",
  height = 220,
  area = true,
  suffix = "",
}: {
  data: Point[];
  color?: string;
  height?: number;
  area?: boolean;
  suffix?: string;
}) {
  const uid = useId().replace(/[:]/g, "");
  const W = 720;
  const H = height;
  const pad = { left: 44, right: 14, top: 16, bottom: 28 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const max = niceMax(Math.max(0, ...data.map((d) => d.count)));
  const n = Math.max(1, data.length);
  const x = (i: number) => pad.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const pts = data.map((d, i) => ({ ...d, x: x(i), y: y(d.count) }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath =
    pts.length > 0
      ? `${line} L${pts[pts.length - 1].x.toFixed(1)},${pad.top + innerH} L${pts[0].x.toFixed(1)},${
          pad.top + innerH
        } Z`
      : "";
  const labelEvery = Math.ceil(n / 7);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="Trend chart"
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <linearGradient id={`grad-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((i) => {
        const value = (max / 4) * (4 - i);
        const yy = pad.top + (innerH / 4) * i;
        return (
          <g key={i}>
            <line
              x1={pad.left}
              x2={W - pad.right}
              y1={yy}
              y2={yy}
              stroke="var(--color-line-soft)"
              strokeDasharray={i === 4 ? undefined : "3 5"}
            />
            <text x={pad.left - 8} y={yy + 3} textAnchor="end" fontSize="10" fill="var(--color-ink-3)">
              {Math.round(value)}
            </text>
          </g>
        );
      })}
      {area && areaPath ? <path d={areaPath} fill={`url(#grad-${uid})`} /> : null}
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={`${p.label}-${i}`}>
          <circle cx={p.x} cy={p.y} r={i === pts.length - 1 ? 4.5 : 2.5} fill={color} stroke="var(--color-surface)" strokeWidth="1.5">
            <title>{`${p.label}: ${p.count}${suffix ? " " + suffix : ""}`}</title>
          </circle>
          {i % labelEvery === 0 || i === n - 1 ? (
            <text x={p.x} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--color-ink-3)">
              {p.label}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

export function BarChart({
  data,
  color = "var(--color-gold)",
  height = 200,
  suffix = "",
}: {
  data: Point[];
  color?: string;
  height?: number;
  suffix?: string;
}) {
  const W = 720;
  const H = height;
  const pad = { left: 38, right: 12, top: 14, bottom: 28 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const max = niceMax(Math.max(0, ...data.map((d) => d.count)));
  const n = Math.max(1, data.length);
  const slot = innerW / n;
  const barW = Math.max(4, Math.min(34, slot * 0.55));
  const labelEvery = Math.ceil(n / 8);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Bar chart" style={{ display: "block" }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const value = (max / 4) * (4 - i);
        const yy = pad.top + (innerH / 4) * i;
        return (
          <g key={i}>
            <line x1={pad.left} x2={W - pad.right} y1={yy} y2={yy} stroke="var(--color-line-soft)" strokeDasharray={i === 4 ? undefined : "3 5"} />
            <text x={pad.left - 8} y={yy + 3} textAnchor="end" fontSize="10" fill="var(--color-ink-3)">
              {Math.round(value)}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const h = (d.count / max) * innerH;
        const xx = pad.left + slot * i + (slot - barW) / 2;
        const yy = pad.top + innerH - h;
        return (
          <g key={`${d.label}-${i}`}>
            <rect x={xx} y={yy} width={barW} height={Math.max(1, h)} rx={4} fill={color} opacity={0.9}>
              <title>{`${d.label}: ${d.count}${suffix ? " " + suffix : ""}`}</title>
            </rect>
            {i % labelEvery === 0 || i === n - 1 ? (
              <text x={xx + barW / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--color-ink-3)">
                {d.label}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export function Donut({
  data,
  size = 176,
  thickness = 22,
  centerLabel = "total",
}: {
  data: { label: string; count: number; color?: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="sa-donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribution">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-surface-2)"
          strokeWidth={thickness}
        />
        {data.map((d, i) => {
          const value = total ? d.count / total : 0;
          const dash = value * c;
          const el = (
            <circle
              key={d.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={d.color ?? PALETTE[i % PALETTE.length]}
              strokeWidth={thickness}
              strokeDasharray={`${Math.max(0, dash - 2)} ${c}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            >
              <title>{`${d.label}: ${d.count}`}</title>
            </circle>
          );
          offset += dash;
          return el;
        })}
        <text x="50%" y="47%" textAnchor="middle" fontSize="24" fontWeight="800" fill="var(--color-ink)">
          {total}
        </text>
        <text x="50%" y="58%" textAnchor="middle" fontSize="10" fill="var(--color-ink-3)">
          {centerLabel}
        </text>
      </svg>
      <ul className="sa-legend">
        {data.map((d, i) => (
          <li key={d.label}>
            <span className="dot" style={{ background: d.color ?? PALETTE[i % PALETTE.length] }} />
            <span className="lbl">{d.label}</span>
            <strong>{d.count}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
