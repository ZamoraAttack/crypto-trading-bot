"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { useZamoAssistant } from "@/components/ZamoAssistantProvider";

// Web Speech API isn't in lib.dom.d.ts yet — minimal shape for what we use.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

const VOICE_STORAGE_KEY = "zamo-voice-uri";

export default function VoiceControl() {
  // shared brain — status/history/sendMessage all come from ZamoAssistantProvider so this
  // component and the in-OS text panel are two windows into the same conversation, not two
  // separate assistants. "unsupported" (no browser Speech API) stays local — it's a fact about
  // this surface, not a ZAMO-wide status.
  const { status, setStatus, sendMessage } = useZamoAssistant();
  const [unsupported, setUnsupported] = useState(false);
  const [transcript, setTranscript] = useState(""); // live interim STT text — inherently voice-only
  const [reply, setReply] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      if (!available.length) return;
      setVoices(available);
      setSelectedVoiceURI((current) => {
        if (current && available.some((v) => v.voiceURI === current)) return current;
        const saved = localStorage.getItem(VOICE_STORAGE_KEY);
        if (saved && available.some((v) => v.voiceURI === saved)) return saved;
        const mark = available.find((v) => v.name.includes("Mark"));
        return (mark ?? available[0]).voiceURI;
      });
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  function handleVoiceChange(uri: string) {
    setSelectedVoiceURI(uri);
    localStorage.setItem(VOICE_STORAGE_KEY, uri);
  }

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setUnsupported(true);
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      setTranscript(last[0].transcript);
      if (last.isFinal) {
        void handleFinalTranscript(last[0].transcript);
      }
    };
    recognition.onerror = () => setStatus("idle");
    recognition.onend = () => {
      setStatus((s) => (s === "listening" ? "idle" : s));
    };

    recognitionRef.current = recognition;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFinalTranscript = useCallback(async (text: string) => {
    if (!text.trim()) {
      setStatus("idle");
      return;
    }
    setReply("");

    const replyText = await sendMessage(text, "voice");
    setReply(replyText);
    // "working" while ZAMO is actively speaking the reply — voice's equivalent of the old
    // "speaking" state, folded into the shared vocabulary's "working" rather than a 7th state
    setStatus("working");

    const utterance = new SpeechSynthesisUtterance(replyText);
    const chosenVoice = voices.find((v) => v.voiceURI === selectedVoiceURI);
    if (chosenVoice) utterance.voice = chosenVoice;
    utterance.onend = () => setStatus("idle");
    utterance.onerror = () => setStatus("idle");
    window.speechSynthesis.speak(utterance);
  }, [voices, selectedVoiceURI, sendMessage, setStatus]);

  function toggleListening() {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (status === "listening") {
      recognition.stop();
      setStatus("idle");
      return;
    }

    if (status === "thinking" || status === "working") return;

    setTranscript("");
    setReply("");
    setStatus("listening");
    recognition.start();
  }

  if (unsupported) {
    return (
      <p className="text-[10px] uppercase tracking-[0.2em] text-muted pointer-events-none select-none">
        Voice not supported in this browser
      </p>
    );
  }

  const displayText = status === "listening" ? transcript : status === "working" || status === "thinking" ? reply : "";

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <button
        onClick={toggleListening}
        disabled={status === "thinking" || status === "working"}
        className="w-9 h-9 rounded-full flex items-center justify-center border border-accent-2/40 bg-black/20 backdrop-blur-sm hover:border-accent-2 transition-colors disabled:opacity-50"
        style={{ boxShadow: status === "listening" ? "0 0 16px rgba(34,211,238,0.6)" : undefined }}
        title={status === "listening" ? "Stop listening" : "Ask ZAMO"}
      >
        {status === "listening" ? (
          <Mic className="w-4 h-4 text-accent-2 animate-pulse" />
        ) : (
          <MicOff className="w-4 h-4 text-white/60" />
        )}
      </button>

      {voices.length > 0 && status === "idle" && (
        <select
          value={selectedVoiceURI}
          onChange={(e) => handleVoiceChange(e.target.value)}
          className="text-[9px] uppercase tracking-wider bg-black/20 backdrop-blur-sm border border-accent-2/20 rounded text-white/50 px-1.5 py-0.5 max-w-[140px] focus:outline-none focus:border-accent-2/50"
          title="Voice"
        >
          {voices
            .filter((v) => v.lang.startsWith("en"))
            .map((v) => (
              <option key={v.voiceURI} value={v.voiceURI} className="bg-black text-white">
                {v.name}
              </option>
            ))}
        </select>
      )}

      {status === "thinking" && (
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted pointer-events-none animate-pulse-slow">
          Thinking…
        </p>
      )}

      {displayText && status !== "thinking" && (
        <p
          className="text-xs text-center max-w-xs tabnum pointer-events-none"
          style={{ color: "#e0e7ff", textShadow: "0 0 6px rgba(224,231,255,0.5)" }}
        >
          {displayText}
        </p>
      )}
    </div>
  );
}
