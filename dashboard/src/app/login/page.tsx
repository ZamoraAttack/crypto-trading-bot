"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router  = useRouter();
  const [pin, setPin]       = useState("");
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError("Incorrect PIN");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-xs bg-surface border border-border rounded-xl p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Trading Bot</h1>
          <p className="text-muted text-sm mt-1">Enter your PIN</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            inputMode="numeric"
            maxLength={10}
            placeholder="PIN"
            value={pin}
            onChange={e => setPin(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-3 text-white text-center text-2xl tracking-widest focus:outline-none focus:border-accent"
            required
          />

          {error && <p className="text-danger text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-indigo-500 text-white font-medium py-2 rounded-lg transition disabled:opacity-50"
          >
            {loading ? "Checking…" : "Enter"}
          </button>
        </form>
      </div>
    </main>
  );
}
