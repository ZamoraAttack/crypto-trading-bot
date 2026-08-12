"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface Point { t: string; value: number }

// Recharts renders raw SVG attributes, not Tailwind classNames, so colors
// here can't reference the design tokens directly -- these are the exact
// same hex values as tailwind.config.ts (border/muted/accent) kept in sync
// by hand, not an independent palette like this component used before.
const TOKEN = {
  border: "#1a1a2e",
  muted:  "#6b7280",
  text:   "#e2e8f0",   // matches globals.css body color
  accent: "#6366f1",
  surface2: "#13131f",
};

export default function EquityCurveChart({ points, height = 180 }: { points: Point[]; height?: number }) {
  if (points.length < 2) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-muted text-sm">
        Not enough history yet to chart.
      </div>
    );
  }

  const data = points.map(p => ({
    t: new Date(p.t).getTime(),
    value: p.value,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={TOKEN.accent} stopOpacity={0.25} />
            <stop offset="100%" stopColor={TOKEN.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={TOKEN.border} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(t) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          stroke={TOKEN.muted}
          tick={{ fill: TOKEN.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: TOKEN.border }}
          minTickGap={40}
        />
        <YAxis
          stroke={TOKEN.muted}
          tick={{ fill: TOKEN.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `$${v}`}
          width={56}
        />
        <Tooltip
          contentStyle={{ background: TOKEN.surface2, border: `1px solid ${TOKEN.border}`, borderRadius: 10 }}
          labelStyle={{ color: TOKEN.muted }}
          itemStyle={{ color: TOKEN.text }}
          formatter={(v: number) => [`$${v.toFixed(2)}`, "Balance"]}
          labelFormatter={(t) => new Date(t).toLocaleString()}
        />
        <Area type="monotone" dataKey="value" stroke={TOKEN.text} strokeWidth={1.5} fill="url(#equityFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
