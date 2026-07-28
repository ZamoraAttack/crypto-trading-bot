"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import XrpIcon from "@/components/jarvis/XrpIcon";

const LINKS: { href: string; label: string; icon: ReactNode }[] = [
  { href: "/",           label: "ZAMO",       icon: "🏠" },
  { href: "/memory",     label: "Memory",     icon: "🧠" },
  { href: "/connectors", label: "Connectors", icon: "🔌" },
  { href: "/crypto",     label: "Crypto Bot", icon: <XrpIcon className="w-4 h-4" /> },
  { href: "/polymarket", label: "Polymarket", icon: "◈" },
  { href: "/revenue",    label: "Revenue",    icon: "💰" },
  { href: "/trades",     label: "Trades",     icon: "📈" },
  { href: "/logs",       label: "Logs",       icon: "📋" },
];

const STORAGE_KEY = "zamo-sidebar-collapsed";

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
        "glass sticky top-0 h-screen shrink-0 border-r border-white/5 flex flex-col transition-[width] duration-200",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* Logo + collapse toggle */}
      <div className="flex items-center justify-between shrink-0 px-4 h-14 border-b border-white/5">
        <Link href="/" className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-accent-2 flex items-center justify-center text-white text-xs font-bold shadow-glow-sm shrink-0">
            Z
          </div>
          {!collapsed && (
            <span className="font-bold text-sm tracking-wide gradient-text truncate">ZamoraOS</span>
          )}
        </Link>
        {!collapsed && (
          <button
            onClick={toggleCollapsed}
            className="text-muted hover:text-white transition shrink-0 ml-2 w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/5"
            title="Collapse sidebar"
          >
            «
          </button>
        )}
      </div>
      {collapsed && (
        <button
          onClick={toggleCollapsed}
          className="flex items-center justify-center py-2 text-muted hover:text-white transition shrink-0 border-b border-white/5"
          title="Expand sidebar"
        >
          »
        </button>
      )}

      {/* Nav links */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {LINKS.map(l => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              title={collapsed ? l.label : undefined}
              className={clsx(
                "flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                collapsed && "justify-center",
                active
                  ? "bg-accent/15 text-accent shadow-glow-sm border border-accent/20"
                  : "text-muted hover:text-white hover:bg-white/5"
              )}
            >
              <span className="w-4 h-4 shrink-0 flex items-center justify-center text-base leading-none [&>svg]:w-4 [&>svg]:h-4">
                {l.icon}
              </span>
              {!collapsed && <span className="truncate">{l.label}</span>}
            </Link>
          );
        })}
      </div>

      {/* Sign out */}
      <button
        onClick={logout}
        className={clsx(
          "flex items-center gap-2 px-4 py-3 text-muted text-sm hover:text-white transition shrink-0 border-t border-white/5",
          collapsed && "justify-center px-0"
        )}
        title={collapsed ? "Sign out" : undefined}
      >
        <span className="leading-none">⏻</span>
        {!collapsed && <span>Sign out</span>}
      </button>
    </nav>
  );
}
