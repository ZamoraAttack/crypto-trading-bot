"use client";

import { useState } from "react";
import { api } from "@/lib/api";

export default function EmergencyStop({ onStop }: { onStop?: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<string | null>(null);

  async function handleStop() {
    if (!confirm) { setConfirm(true); return; }
    setLoading(true);
    try {
      const r = await api.emergencyStop();
      setResult(`Stopped. Closed ${r.count} position(s).`);
      onStop?.();
    } finally {
      setLoading(false);
      setConfirm(false);
    }
  }

  if (result) {
    return (
      <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-danger text-sm font-medium">
        🛑 {result}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {confirm && (
        <p className="text-warning text-sm">
          This closes ALL open positions immediately. Are you sure?
        </p>
      )}
      <button
        onClick={handleStop}
        disabled={loading}
        className={`px-4 py-2 rounded-lg font-semibold text-sm transition disabled:opacity-50 ${
          confirm
            ? "bg-danger text-white animate-pulse"
            : "bg-danger/20 text-danger border border-danger/40 hover:bg-danger/30"
        }`}
      >
        {loading ? "Stopping…" : confirm ? "CONFIRM EMERGENCY STOP" : "🛑 Emergency Stop"}
      </button>
      {confirm && (
        <button
          onClick={() => setConfirm(false)}
          className="ml-2 text-muted text-sm hover:text-white"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
