"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const TERMINAL_STATES = new Set(["completed", "learning", "archived", "blocked"]);

// Polls the server component's data while a mission is still moving through
// the Mission Control Loop, so the founder can watch state transitions
// (Delegated → In Progress → Review → Completed → Learning) without manually
// reloading. Stops once the mission reaches a terminal state. A future pass
// could reuse the existing WebSocket broadcast() mechanism (main.py) instead
// of polling — deferred for this vertical slice, not a hard requirement.
export default function MissionLiveRefresh({ state }: { state: string }) {
  const router = useRouter();

  useEffect(() => {
    if (TERMINAL_STATES.has(state)) return;
    const id = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(id);
  }, [state, router]);

  return null;
}
