"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface Point { t: string; value: number }

export default function EquityCurveChart({ points }: { points: Point[] }) {
  if (points.length < 2) {
    return (
      <div className="h-64 flex items-center justify-center text-[#6B7280] text-sm">
        Not enough history yet to chart.
      </div>
    );
  }

  const data = points.map(p => ({
    t: new Date(p.t).getTime(),
    value: p.value,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E6EDF3" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#E6EDF3" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#2A2F3A" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(t) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          stroke="#6B7280"
          tick={{ fill: "#6B7280", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#2A2F3A" }}
          minTickGap={40}
        />
        <YAxis
          stroke="#6B7280"
          tick={{ fill: "#6B7280", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `$${v}`}
          width={56}
        />
        <Tooltip
          contentStyle={{ background: "#161B22", border: "1px solid #2A2F3A", borderRadius: 8 }}
          labelStyle={{ color: "#6B7280" }}
          itemStyle={{ color: "#E6EDF3" }}
          formatter={(v: number) => [`$${v.toFixed(2)}`, "Balance"]}
          labelFormatter={(t) => new Date(t).toLocaleString()}
        />
        <Area type="monotone" dataKey="value" stroke="#E6EDF3" strokeWidth={1.5} fill="url(#equityFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
