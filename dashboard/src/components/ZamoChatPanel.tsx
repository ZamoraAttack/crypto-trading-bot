"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send } from "lucide-react";
import { useZamoAssistant, type ZamoStatus } from "./ZamoAssistantProvider";

const STATUS_LABEL: Record<ZamoStatus, string> = {
  idle: "System online",
  listening: "Listening…",
  thinking: "Thinking…",
  working: "Working…",
  notification: "New notification",
  urgent: "Urgent",
};

const STATUS_DOT_CLASS: Record<ZamoStatus, string> = {
  idle: "bg-success",
  listening: "bg-accent-2",
  thinking: "bg-accent-2",
  working: "bg-accent",
  notification: "bg-accent-2",
  urgent: "bg-danger",
};

// Floating button + slide-in panel — the "text inside ZAMO OS" surface. Lives in AppShell, so
// it's available on every page, not just the homepage. Reads/writes the same shared context
// VoiceControl uses: a message sent here shows up in the same history a voice turn would have
// joined, and vice versa — one conversation, two entry points.
export default function ZamoChatPanel() {
  const { status, history, sendMessage } = useZamoAssistant();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, open]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    try {
      await sendMessage(text, "text");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <>
      {/* Floating trigger — bottom-right, consistent glass material with the rest of the OS.
          Only rendered while the panel is closed: the panel has its own header close button, and
          keeping this one mounted at the same corner while open collided with the panel's own
          send button underneath it. A restrained pulse only for notification/urgent, matching
          the "no excessive glow" brief — idle/thinking/working never make this button flash. */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="bottom-6 right-6 z-40 w-14 h-14 rounded-full glass-panel flex items-center justify-center text-white/80 hover:text-white transition-colors"
          style={{
            // inline, not the `fixed` utility class — .glass-panel sets `position: relative` and
            // (being defined after Tailwind's utility layer in the stylesheet) silently wins over
            // the `fixed` class at equal specificity. Inline style always wins regardless of
            // source order, which is what actually fixes it.
            position: "fixed",
            boxShadow: status === "urgent"
              ? "0 0 18px 4px rgba(239,68,68,0.5)"
              : status === "notification"
                ? "0 0 16px 3px rgba(34,211,238,0.45)"
                : "0 8px 24px rgba(0,0,0,0.4)",
          }}
          title="Open ZAMO chat"
        >
          <MessageCircle className="w-5 h-5" strokeWidth={1.75} />
          {(status === "notification" || status === "urgent") && (
            <span className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full ${STATUS_DOT_CLASS[status]} animate-pulse`} />
          )}
        </button>
      )}

      {/* Slide-in panel — mirror of the sidebar's flush-edge treatment (rounded only on the
          content-facing left side here, since this panel sits flush against the right edge) */}
      <div
        className={`top-0 right-0 z-30 h-screen w-full sm:w-[380px] glass-panel flex flex-col transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ position: "fixed", borderRadius: "20px 0 0 20px" }}
      >
        <div className="flex items-center justify-between shrink-0 px-5 h-16 border-b border-white/[0.07]">
          <div>
            <p className="font-bold text-sm tracking-wide gradient-text">ZAMO</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-[6px] h-[6px] rounded-full ${STATUS_DOT_CLASS[status]}`} />
              <span className="text-[10px] uppercase tracking-[0.16em] text-white/45">{STATUS_LABEL[status]}</span>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-white/50 hover:text-white transition w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/[0.08]"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {history.length === 0 && (
            <p className="text-xs text-white/40 text-center mt-8">
              Ask ZAMO about your bots, revenue, or anything it remembers — this conversation is shared with voice.
            </p>
          )}
          {history.map((turn, i) => (
            <div key={i} className={turn.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  turn.role === "user"
                    ? "max-w-[85%] rounded-xl rounded-br-sm bg-accent/20 text-white text-[13px] px-3.5 py-2.5"
                    : "max-w-[85%] rounded-xl rounded-bl-sm glass-tile text-white/90 text-[13px] px-3.5 py-2.5"
                }
              >
                {turn.content}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="glass-tile rounded-xl rounded-bl-sm px-3.5 py-2.5 text-[13px] text-white/40 animate-pulse-slow">
                Thinking…
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 p-4 border-t border-white/[0.07]">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message ZAMO…"
              rows={1}
              className="flex-1 resize-none bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-accent-2/50 max-h-24"
            />
            <button
              onClick={() => void handleSend()}
              disabled={!input.trim() || sending}
              className="shrink-0 w-9 h-9 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 transition-colors flex items-center justify-center disabled:opacity-40"
              title="Send"
            >
              <Send className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
