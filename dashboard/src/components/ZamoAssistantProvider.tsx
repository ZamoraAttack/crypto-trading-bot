"use client";

import { createContext, useCallback, useContext, useRef, useState, type Dispatch, type SetStateAction, type ReactNode } from "react";

// The six shared states — Core (ZamoScene) and every conversation surface (Voice, the in-OS
// text panel, eventually Telegram) read from the same status so they visually/behaviorally
// agree on what ZAMO is doing right now. "Notification" and "Urgent" aren't triggered by
// anything yet (no Agents/Automation exist to raise them) — the state and its visual mapping
// exist so those phases have something to plug into, not because they're live today.
export type ZamoStatus = "idle" | "listening" | "thinking" | "working" | "notification" | "urgent";

export interface ZamoChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface ZamoAssistantContextValue {
  status: ZamoStatus;
  // full Dispatch type (not just (status) => void) so functional updates — setStatus(s => ...) —
  // work through the context the same way they would with a raw useState setter; VoiceControl's
  // recognition.onend handler needs that form to avoid a stale-closure read of `status`
  setStatus: Dispatch<SetStateAction<ZamoStatus>>;
  history: ZamoChatTurn[];
  /** Send a message through the shared brain. Returns the reply text (or throws never — errors become a reply). */
  sendMessage: (text: string, surface: "voice" | "text") => Promise<string>;
}

const ZamoAssistantContext = createContext<ZamoAssistantContextValue | null>(null);

// Fallback used when this hook is read outside the Provider. Deliberately does NOT throw:
// components inside ZamoScene's <Canvas> (react-three-fiber renders via its own reconciler,
// separate from the main DOM tree) read this context, and a thrown error there doesn't surface
// as a normal caught React error during a Next.js client-side transition — it silently stalls
// the navigation instead (confirmed: Link clicks into "/" stopped updating the URL at all,
// with no console error, only during soft nav — a full page load always worked fine). A safe
// idle fallback keeps the Core rendering correctly during that transient window instead.
const FALLBACK_CONTEXT: ZamoAssistantContextValue = {
  status: "idle",
  setStatus: () => {},
  history: [],
  sendMessage: async () => "",
};

export function useZamoAssistant() {
  const ctx = useContext(ZamoAssistantContext);
  return ctx ?? FALLBACK_CONTEXT;
}

// Wraps the whole app (see AppShell.tsx) — not just the homepage — so the floating text panel
// and its shared status/history are available everywhere, the same way the sidebar is.
export function ZamoAssistantProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ZamoStatus>("idle");
  const [history, setHistory] = useState<ZamoChatTurn[]>([]);
  // ref mirrors `history` for the fetch call — avoids a stale-closure history in sendMessage
  // without making sendMessage depend on (and get recreated by) history state changes
  const historyRef = useRef<ZamoChatTurn[]>([]);

  const sendMessage = useCallback(async (text: string, surface: "voice" | "text") => {
    const trimmed = text.trim();
    if (!trimmed) return "";

    setStatus("thinking");
    const userTurn: ZamoChatTurn = { role: "user", content: trimmed };
    const priorHistory = historyRef.current;
    historyRef.current = [...priorHistory, userTurn].slice(-10);
    setHistory(historyRef.current);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history: priorHistory, surface }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      const replyText = data.reply || "Sorry, I couldn't get a response.";

      const assistantTurn: ZamoChatTurn = { role: "assistant", content: replyText };
      historyRef.current = [...historyRef.current, assistantTurn].slice(-10);
      setHistory(historyRef.current);

      // voice sets "working" itself while TTS plays (see VoiceControl) — for text, thinking is
      // immediately followed by idle since there's no spoken-output phase to wait through
      if (surface === "text") setStatus("idle");
      return replyText;
    } catch {
      // real bug caught by the integration pass's deliberate network-failure test: this branch
      // returned the fallback text but never added it to `history`, so the text panel (which
      // renders from `history`, not sendMessage's return value) silently showed nothing at all
      // after a failure — user message visible, no reply, no error, status correctly back to
      // idle. Voice happened to still work since VoiceControl captures the return value
      // directly, which is exactly why this was easy to miss without a deliberate failure test.
      const fallback = "Something went wrong reaching ZAMO.";
      const assistantTurn: ZamoChatTurn = { role: "assistant", content: fallback };
      historyRef.current = [...historyRef.current, assistantTurn].slice(-10);
      setHistory(historyRef.current);
      setStatus("idle");
      return fallback;
    }
  }, []);

  return (
    <ZamoAssistantContext.Provider value={{ status, setStatus, history, sendMessage }}>
      {children}
    </ZamoAssistantContext.Provider>
  );
}
