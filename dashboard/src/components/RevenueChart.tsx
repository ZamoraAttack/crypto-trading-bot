"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import type { PgRevenueMonth } from "@/lib/api";

function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  return new Date(Number(year), Number(m) - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

export default function RevenueChart({ monthly }: { monthly: PgRevenueMonth[] }) {
  if (monthly.length < 2) {
    return (
      <div className="h-64 flex items-center justify-center text-[#6B7280] text-sm">
        Not enough history yet to chart.
      </div>
    );
  }

  const data = monthly.map(m => ({
    month: formatMonth(m.month),
    "Crypto Bot": m.crypto_pnl,
    "Polymarket Bot": m.polymarket_pnl,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#2A2F3A" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="month"
          stroke="#6B7280"
          tick={{ fill: "#6B7280", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#2A2F3A" }}
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
          formatter={(v: number) => `$${v.toFixed(2)}`}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "#6B7280" }} />
        <Bar dataKey="Crypto Bot" stackId="revenue" fill="#3b82f6" radius={[0, 0, 0, 0]} />
        <Bar dataKey="Polymarket Bot" stackId="revenue" fill="#a855f7" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
