"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

const CATEGORIES = [
  "decision", "goal", "business_knowledge", "relationship",
  "conversation", "experiment", "outcome", "agent_history",
];

export default function MemoryForm() {
  const router = useRouter();
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      await api.memory.create({ category, title, content, source: "manual" });
      setTitle("");
      setContent("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-2 border border-border rounded-2xl p-5 space-y-3">
      <h3 className="text-sm font-semibold text-white">Remember something</h3>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-white md:col-span-1"
        >
          {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
        </select>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Short title"
          className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-white md:col-span-3"
        />
      </div>
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="What should ZAMO remember?"
        rows={3}
        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-white resize-none"
      />
      <button
        type="submit"
        disabled={saving || !title.trim() || !content.trim()}
        className="px-4 py-2 rounded-lg font-semibold text-sm bg-accent/20 text-accent border border-accent/40 hover:bg-accent/30 transition disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save to Memory"}
      </button>
    </form>
  );
}
