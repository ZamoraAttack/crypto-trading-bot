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
        <div className="flex-1 min-w-0 h-screen overflow-y-auto">
          {children}
        </div>
      </div>
      <ZamoChatPanel />
    </ZamoAssistantProvider>
  );
}
