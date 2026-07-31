"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import { ZamoAssistantProvider } from "./ZamoAssistantProvider";
import ZamoChatPanel from "./ZamoChatPanel";

const PUBLIC_PATHS = ["/login"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (PUBLIC_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  // Provider wraps the whole app (not just the homepage) so the floating chat panel, and any
  // future Core status wiring, are available on every page — the same way the sidebar is.
  return (
    <ZamoAssistantProvider>
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        {/* pt-16 on mobile only — clearance for the fixed hamburger button (Sidebar.tsx), which
            otherwise overlaps every page's own title in the same top-left corner. Desktop is
            unaffected (md:pt-0) since the hamburger itself is md:hidden there. */}
        <div className="flex-1 min-w-0 h-screen overflow-y-auto pt-16 md:pt-0">
          {children}
        </div>
      </div>
      <ZamoChatPanel />
    </ZamoAssistantProvider>
  );
}
