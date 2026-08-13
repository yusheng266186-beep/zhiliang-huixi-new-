"use client";

import type { ReactNode } from "react";

export const VISUAL_COLORS = {
  primary: "#6862F5",
  primaryDark: "#4D47D7",
  primarySoft: "#B8B4FF",
  cyan: "#2BC7BC",
  cyanDark: "#119B91",
  amber: "#F2A93B",
  amberDark: "#C97B0B",
  coral: "#EF6A5B",
  ink: "#25252B",
  muted: "#8D8D98",
  grid: "#ECECF2",
  surface: "#FFFFFF",
  cursor: "rgba(104, 98, 245, .055)",
} as const;

type TooltipEntry = {
  color?: string;
  dataKey?: string | number;
  name?: string | number;
  value?: string | number;
};

export function PremiumTooltip({
  active,
  label,
  payload,
  units = {},
  formatter,
}: {
  active?: boolean;
  label?: ReactNode;
  payload?: TooltipEntry[];
  units?: Record<string, string>;
  formatter?: (value: string | number, name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="premium-tooltip">
      {label !== undefined && label !== null && <b>{label}</b>}
      <div>
        {payload.map((entry, index) => {
          const name = String(entry.name ?? entry.dataKey ?? "数值");
          const value = entry.value ?? "—";
          return <span key={`${name}-${index}`}><i style={{ background: entry.color ?? VISUAL_COLORS.primary }} /><em>{name}</em><strong>{formatter ? formatter(value, name) : `${value}${units[name] ?? ""}`}</strong></span>;
        })}
      </div>
    </div>
  );
}

type LegendEntry = { color?: string; value?: string | number; dataKey?: string | number };

export function PremiumLegend({ payload }: { payload?: LegendEntry[] }) {
  if (!payload?.length) return null;
  return <div className="premium-legend">{payload.map((item, index) => <span key={`${item.value ?? item.dataKey}-${index}`}><i style={{ background: item.color ?? VISUAL_COLORS.primary }} />{String(item.value ?? item.dataKey ?? "")}</span>)}</div>;
}

export function ChartGradient({ id, from, to, vertical = true }: { id: string; from: string; to: string; vertical?: boolean }) {
  return <linearGradient id={id} x1="0" y1="0" x2={vertical ? "0" : "1"} y2={vertical ? "1" : "0"}><stop offset="0%" stopColor={from} /><stop offset="100%" stopColor={to} /></linearGradient>;
}

export const axisStyle = { fontSize: 9, fill: VISUAL_COLORS.muted, fontWeight: 550 } as const;
export const chartGridProps = { stroke: VISUAL_COLORS.grid, strokeDasharray: "3 8", vertical: false } as const;

