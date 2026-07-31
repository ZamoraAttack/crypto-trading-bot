"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { Home, Brain, Plug, Diamond, Wallet, TrendingUp, FileText, ChevronLeft, ChevronRight, LogOut, Menu, X } from "lucide-react";
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
  label, links, pathname, collapsed, onNavigate,
}: {
  label: string;
  links: { href: string; label: string; icon: ReactNode }[];
  pathname: string;
  collapsed: boolean;
  onNavigate: () => void;
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
        const className = clsx(
          "relative flex items-center gap-3.5 pl-4 pr-2.5 py-2.5 rounded-lg text-[13px] transition-all duration-200",
          collapsed && "justify-center",
          // no flat fill on active — identity comes from the luminous rail + text weight/
          // color instead, per feedback that a filled row read as a generic website menu
          active ? "text-white font-semibold tracking-[0.01em]" : "text-white/55 font-medium hover:text-white hover:bg-white/[0.06]"
        );
        const content = (
          <>
            {/* a persistent milled channel (always present, very faint) with the luminous strip
                sitting inside it only when active — "machined into the rail," not a highlight
                painted on top. The channel alone (no glow) reads as a physical groove even on
                inactive rows, which is what makes the active one feel like a light switched on
                inside an existing slot rather than a decal appearing from nowhere. */}
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
          </>
        );
        // Bidirectional, not just "entering /": soft navigation stalls the same way *leaving*
        // the Canvas page (current pathname is "/") as it does entering it — confirmed both
        // directions independently during the integration pass. So any link where either side
        // of the transition is "/" gets a plain <a> (forces a real browser navigation) instead
        // of next/link. Pre-existing Canvas/soft-navigation interaction, not caused by the
        // Communications Layer work.
        const involvesHomeCanvas = l.href === "/" || pathname === "/";
        return involvesHomeCanvas ? (
          <a key={l.href} href={l.href} title={collapsed ? l.label : undefined} className={className} onClick={onNavigate}>
            {content}
          </a>
        ) : (
          <Link key={l.href} href={l.href} title={collapsed ? l.label : undefined} className={className} onClick={onNavigate}>
            {content}
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
  // Mobile-only off-canvas state — a real fix (not just a documented gap) for the ~390px width
  // bug found during the integration pass: below `md`, the sidebar used to always render at its
  // full 224px, eating well over half the viewport and badly crowding the hero's labels. Desktop
  // behavior (collapsed/expanded, always visible) is completely unchanged above `md`.
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setCollapsed(stored === "true");
  }, []);

  // close the mobile drawer on route change (e.g. after tapping a nav link) — usePathname()
  // updates on every navigation, so this effect re-fires exactly when it should
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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
    <>
      {/* Hamburger trigger — mobile only (md:hidden). Fixed so it's reachable regardless of the
          sidebar's own off-canvas position. */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-40 w-10 h-10 rounded-lg glass-panel flex items-center justify-center text-white/80"
        style={{ position: "fixed" }} // .glass-panel's own `position: relative` otherwise wins — same class-order trap as the chat button/panel
        title="Open menu"
      >
        <Menu className="w-5 h-5" strokeWidth={1.75} />
      </button>

      {/* Backdrop — mobile only, tap to close */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <nav
        className={clsx(
          "glass-panel glass-panel-edge command-rail flex flex-col transition-[transform,width] duration-300",
          // !fixed / md:!sticky — the `!` (Tailwind's important-modifier) is required, not just
          // `fixed`/`md:sticky`: .glass-panel sets `position: relative` and, being defined after
          // Tailwind's utility layer in the stylesheet, wins over a plain utility class at equal
          // specificity (the same trap hit with the chat button/panel earlier). Inline styles
          // can't express "fixed on mobile, sticky on desktop" in one value, so `!important` is
          // the actual fix here instead.
          "!fixed inset-y-0 left-0 z-50 w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          // desktop (md+): back to the original always-visible, in-flow rail — completely
          // unaffected by mobileOpen
          "md:!sticky md:top-0 md:h-screen md:shrink-0 md:translate-x-0 md:z-auto",
          collapsed ? "md:w-16" : "md:w-56"
        )}
      >
      <div className="command-rail-edge" />
      {/* Mobile-only close button inside the drawer header */}
      <button
        onClick={() => setMobileOpen(false)}
        className="md:hidden absolute top-4 right-4 z-10 w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08]"
        title="Close menu"
      >
        <X className="w-4 h-4" strokeWidth={1.75} />
      </button>

      {/* Logo + collapse toggle — stronger presence than before: taller header, a slightly bigger
          mark with its own glow, and a lit bottom edge instead of a plain hairline border */}
      <div className="relative flex items-center justify-between shrink-0 px-4 h-16 border-b border-white/[0.07]">
        <span className="absolute bottom-0 left-4 right-4 h-px bg-gradient-to-r from-accent/50 via-accent-2/30 to-transparent" />
        {/* plain <a>, not next/link — same reason as the "ZAMO" nav item below: soft navigation
            into "/" (the Canvas hero) silently stalls */}
        <a href="/" className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-2 flex items-center justify-center text-white text-sm font-bold shadow-glow-sm shrink-0">
            Z
          </div>
          {!collapsed && (
            <span className="font-bold text-sm tracking-wide gradient-text truncate">ZamoraOS</span>
          )}
        </a>
        {/* desktop-only (hidden md:flex) — the collapse/expand toggle controls the md:w-16 vs
            md:w-56 desktop widths only; the mobile drawer always shows full labels at w-64, so
            exposing this control on mobile would let `collapsed` hide the text labels there too
            while the drawer stayed full-width, which would look broken (icons floating in a lot
            of empty space) rather than actually shrinking anything */}
        {!collapsed && (
          <button
            onClick={toggleCollapsed}
            className="hidden md:flex text-white/50 hover:text-white transition shrink-0 ml-2 w-6 h-6 items-center justify-center rounded-md hover:bg-white/[0.08]"
            title="Collapse sidebar"
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
          </button>
        )}
      </div>
      {collapsed && (
        <button
          onClick={toggleCollapsed}
          className="hidden md:flex items-center justify-center py-2.5 text-white/50 hover:text-white transition shrink-0 border-b border-white/[0.07]"
          title="Expand sidebar"
        >
          <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
        </button>
      )}

      {/* Nav links — two groups with a quiet divider between them, more vertical rhythm between
          items than before (rows breathe rather than sitting edge to edge) */}
      <div className="flex-1 overflow-y-auto py-4 px-2 space-y-5">
        <NavGroup label="System" links={SYSTEM_LINKS} pathname={pathname} collapsed={collapsed} onNavigate={() => setMobileOpen(false)} />
        <div className="mx-2 border-t border-white/5" />
        <NavGroup label="Bots" links={BOT_LINKS} pathname={pathname} collapsed={collapsed} onNavigate={() => setMobileOpen(false)} />
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
    </>
  );
}
