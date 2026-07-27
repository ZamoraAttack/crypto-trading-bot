"use client";

import { useEffect, useState } from "react";

export default function ClockReadout() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  const time = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const day  = now.toLocaleDateString(undefined, { weekday: "long" });
  const date = now.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="flex flex-col items-center gap-1 pointer-events-none select-none">
      <p
        className="text-xl font-semibold tabnum text-white tracking-wide"
        style={{ textShadow: "0 0 12px rgba(224,231,255,0.5)" }}
      >
        {time}
      </p>
      <p className="text-[10px] uppercase tracking-[0.2em] text-muted">{day} · {date}</p>
      <div className="flex items-center gap-1.5 mt-1">
        <span className="w-[5px] h-[5px] rounded-full bg-success animate-pulse-slow" />
        <span className="text-[9px] uppercase tracking-[0.2em] text-success">System Online</span>
      </div>
    </div>
  );
}
