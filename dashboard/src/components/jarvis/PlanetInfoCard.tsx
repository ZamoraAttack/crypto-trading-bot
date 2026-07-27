import type { ReactNode } from "react";
import clsx from "clsx";

interface PlanetInfoCardProps {
  icon:         ReactNode;
  label:        string;
  value:        string;
  highlighted?: boolean;
}

export default function PlanetInfoCard({ icon, label, value, highlighted }: PlanetInfoCardProps) {
  return (
    <div className="flex flex-col items-center text-center whitespace-nowrap select-none pointer-events-none">
      <div className={clsx("w-px h-3 mb-1 transition-colors duration-300", highlighted ? "bg-accent-2" : "bg-accent-2/40")} />

      <div className="flex items-center gap-1.5">
        <span
          className={clsx(
            "w-3 h-3 [&>svg]:w-3 [&>svg]:h-3 transition-colors duration-300",
            highlighted ? "text-white" : "text-white/70"
          )}
          style={{ filter: highlighted ? "drop-shadow(0 0 4px currentColor)" : undefined }}
        >
          {icon}
        </span>
        <p
          className={clsx(
            "text-[10px] uppercase tracking-[0.15em] transition-colors duration-300",
            highlighted ? "text-white" : "text-white/50"
          )}
          style={{ textShadow: highlighted ? "0 0 8px rgba(34,211,238,0.65)" : "0 0 4px rgba(34,211,238,0.25)" }}
        >
          {label}
        </p>
      </div>

      <p
        className="text-xs font-semibold tabnum mt-0.5"
        style={{ color: "#e0e7ff", textShadow: "0 0 6px rgba(224,231,255,0.5)" }}
      >
        {value}
      </p>
    </div>
  );
}
