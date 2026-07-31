"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { Home, Brain, Plug, Diamond, Wallet, TrendingUp, FileText, ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import XrpIcon from "@/components/jarvis/XrpIcon";

// One consistent icon system (Lucide) throughout — the emoji set (🏠🧠🔌💰📈📋 etc.) read as a
// website's own informal shorthand, not instrumentation. Crypto Bot keeps its bespoke XrpIcon
// (a real brand mark, not a generic pictogram) and Polymarket keeps Diamond to match the same
// icon already used for it on the ZAMO scene's node — one identity per subsystem across surfaces.
const ICON_PROPS = { strokeWidth: 1.75 } as const;

// Grouped into two sections — system/cross-cutting vs. per-bot pages — rather than one flat
// list. This is the "command rail organizes by function" cue taken from the BitTorrent
// reference's own grouping (nav list, then a divider, then a distinct secondary group), not its
// literal icons/labels.
const SYSTEM_LINKS: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/",           label: "ZAMO",       icon: <Home {...ICON_PROPS} /> },
  { href: "/memory",     label: "Memory",     icon: <Brain {...ICON_PROPS} /> },
  { href: "/connectors", label: "Connectors", icon: <Plug {...ICON_PROPS} /> },
];
const BOT_LINKS: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/crypto",     label: "Crypto Bot", icon: <XrpIcon className="w-[18px] h-[18px]" /> },
  { href: "/polymarket", label: "Polymarket", icon: <Diamond {...ICON_PROPS} /> },
  { href: "/revenue",    label: "Revenue",    icon: <Wallet {...ICON_PROPS} /> },
  { href: "/trades",     label: "Trades",     icon: <TrendingUp {...ICON_PROPS} /> },
  { href: "/logs",       label: "Logs",       icon: <FileText {...ICON_PROPS} /> },
];

const STORAGE_KEY = "zamo-sidebar-collapsed";

function NavGroup({
  label, links, pathname, collapsed,
}: {
  label: string;
  links: { href: string; label: string; icon: ReactNode }[];
  pathname: string;
  collapsed: boolean;
}) {
  return (
    <div className="space-y-1">
      {/* stronger grouping label — small leading tick + brighter weight than before, reads more
          like an instrument-panel section header than a quiet afterthought */}
      {!collapsed && (
        <p className="flex items-center gap-1.5 px-3.5 text-[10px] font-bold text-white/40 uppercase tracking-[0.18em] mb-1.5">
          <span className="w-2 h-px bg-white/25" />
          {label}
        </p>
      )}
      {links.map(l => {
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            title={collapsed ? l.label : undefined}
            className={clsx(
              "relative flex items-center gap-3.5 pl-4 pr-2.5 py-2.5 rounded-lg text-[13px] transition-all duration-200",
              collapsed && "justify-center",
              // no flat fill on active — identity comes from the luminous rail + text weight/
              // color instead, per feedback that a filled row read as a generic website menu
              active ? "text-white font-semibold tracking-[0.01em]" : "text-white/55 font-medium hover:text-white hover:bg-white/[0.06]"
            )}
          >
            {/* illuminated edge with a soft bleed into the row — a narrow luminous rail rather
                than a highlighted rectangle */}
            <span className="absolute left-1 top-1.5 bottom-1.5 w-1 rounded-full bg-black/35 shadow-[inset_1px_0_1.5px_rgba(0,0,0,0.6),inset_-1px_0_1px_rgba(255,255,255,0.05)]" />
            <span className={clsx(
              "absolute left-1 top-1.5 bottom-1.5 w-1 rounded-full transition-all duration-300",
              active ? "bg-accent-2 shadow-[0_0_9px_2px_rgba(34,211,238,0.65)]" : "bg-transparent"
            )} />
            {active && (
              <span className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-accent-2/[0.09] to-transparent pointer-events-none rounded-lg" />
            )}
            <span className={clsx(
              "relative w-[18px] h-[18px] shrink-0 flex items-center justify-center leading-none [&>svg]:w-[18px] [&>svg]:h-[18px] transition-colors duration-200",
              active ? "text-accent-2" : ""
            )}>
              {l.icon}
            </span>
            {!collapsed && <span className="relative truncate">{l.label}</span>}
          </Link>
        );
      })}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setCollapsed(stored === "true");
  }, []);

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <nav
      className={clsx(
        "glass-panel glass-panel-edge command-rail sticky top-0 h-screen shrink-0 flex flex-col transition-[width] duration-200",
        collapsed ? "w-16" : "w-56"
      )}
    >
      <div className="command-rail-edge" />

      {/* Logo + collapse toggle — stronger presence than before: taller header, a slightly bigger
          mark with its own glow, and a lit bottom edge instead of a plain hairline border */}
      <div className="relative flex items-center justify-between shrink-0 px-4 h-16 border-b border-white/[0.07]">
        <span className="absolute bottom-0 left-4 right-4 h-px bg-gradient-to-r from-accent/50 via-accent-2/30 to-transparent" />
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-2 flex items-center justify-center text-white text-sm font-bold shadow-glow-sm shrink-0">
            Z
          </div>
          {!collapsed && (
            <span className="font-bold text-sm tracking-wide gradient-text truncate">ZamoraOS</span>
          )}
        </Link>
        {!collapsed && (
          <button
            onClick={toggleCollapsed}
            className="text-white/50 hover:text-white transition shrink-0 ml-2 w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/[0.08]"
            title="Collapse sidebar"
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
          </button>
        )}
      </div>
      {collapsed && (
        <button
          onClick={toggleCollapsed}
          className="flex items-center justify-center py-2.5 text-white/50 hover:text-white transition shrink-0 border-b border-white/[0.07]"
          title="Expand sidebar"
        >
          <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
        </button>
      )}

      {/* Nav links — two groups with a quiet divider between them, more vertical rhythm between
          items than before (rows breathe rather than sitting edge to edge) */}
      <div className="flex-1 overflow-y-auto py-4 px-2 space-y-5">
        <NavGroup label="System" links={SYSTEM_LINKS} pathname={pathname} collapsed={collapsed} />
        <div className="mx-2 border-t border-white/5" />
        <NavGroup label="Bots" links={BOT_LINKS} pathname={pathname} collapsed={collapsed} />
      </div>

      {/* Sign out */}
      <button
        onClick={logout}
        className={clsx(
          "flex items-center gap-2 px-4 py-3 text-white/55 text-sm hover:text-white transition shrink-0 border-t border-white/[0.07]",
          collapsed && "justify-center px-0"
        )}
        title={collapsed ? "Sign out" : undefined}
      >
        <LogOut className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />
        {!collapsed && <span>Sign out</span>}
      </button>
    </nav>
  );
}
