"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";

const LINKS = [
  { href: "/",           label: "Overview"   },
  { href: "/crypto",     label: "Crypto Bot" },
  { href: "/polymarket", label: "Polymarket" },
  { href: "/trades",     label: "Trades"     },
  { href: "/logs",       label: "Logs"       },
];

export default function NavBar() {
  const pathname = usePathname();
  const router   = useRouter();

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="glass sticky top-0 z-50 border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 flex items-center h-14 gap-6">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-accent-2 flex items-center justify-center text-white text-xs font-bold shadow-glow-sm">
            Z
          </div>
          <span className="font-bold text-sm tracking-wide gradient-text hidden sm:block">
            ZamoraOS
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex gap-0.5 flex-1">
          {LINKS.map(l => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150",
                  active
                    ? "bg-accent/15 text-accent shadow-glow-sm border border-accent/20"
                    : "text-muted hover:text-white hover:bg-white/5"
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </div>

        {/* Sign out */}
        <button
          onClick={logout}
          className="text-muted text-sm hover:text-white transition shrink-0"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
