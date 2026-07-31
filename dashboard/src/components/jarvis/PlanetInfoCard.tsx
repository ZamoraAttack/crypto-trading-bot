import type { ReactNode } from "react";
import clsx from "clsx";

interface PlanetInfoCardProps {
  icon:         ReactNode;
  label:        string;
  value:        string;
  highlighted?: boolean;
}

// Hierarchy per the brief: system name (this card's "label") reads as a medium-weight nameplate,
// not a glowing headline — it identifies the node but shouldn't compete with the status text
// below it, which is the actually-brightest element since it's the thing worth glancing at.
export default function PlanetInfoCard({ icon, label, value, highlighted }: PlanetInfoCardProps) {
  return (
    <div className="flex flex-col items-center text-center whitespace-nowrap select-none pointer-events-none">
      <div className={clsx("w-px h-1.5 mb-0.5 transition-colors duration-300", highlighted ? "bg-accent-2" : "bg-accent-2/30")} />

      <div className="flex items-center gap-1.5">
        <span
          className={clsx(
            "w-3 h-3 [&>svg]:w-3 [&>svg]:h-3 transition-colors duration-300",
            highlighted ? "text-white" : "text-white/60"
          )}
          style={{ filter: highlighted ? "drop-shadow(0 0 4px currentColor)" : undefined }}
        >
          {icon}
        </span>
        {/* nameplate — medium brightness at rest, no glow unless the node itself is highlighted.
            Tracking widened from 0.04em to 0.16em to match the rest of the app's uppercase-label
            family (HUD readouts, section eyebrows) — it was a real outlier before, noticeably
            tighter than everything else and reading more like body text than instrumentation. */}
        <p
          className={clsx(
            "text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors duration-300",
            highlighted ? "text-white" : "text-white/45"
          )}
          style={{ textShadow: highlighted ? "0 0 6px rgba(34,211,238,0.5)" : "none" }}
        >
          {label}
        </p>
      </div>

      {/* status — the brightest text on the card, but sized close to the nameplate rather than
          shouting via size, so the two read as "identity + status" instead of two headlines */}
      <p
        className="text-[11px] font-bold tabnum mt-0.5"
        style={{ color: "#eef2ff", textShadow: "0 0 5px rgba(224,231,255,0.4)" }}
      >
        {value}
      </p>
    </div>
  );
}
