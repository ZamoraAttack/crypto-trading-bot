"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import type { ZamoDepartment } from "@/lib/api";

export default function MissionForm({ departments }: { departments: ZamoDepartment[] }) {
  const router = useRouter();
  const activeDepartments = departments.filter(d => d.status === "active");
  const [departmentSlug, setDepartmentSlug] = useState(activeDepartments[0]?.slug ?? "");
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [successCriteria, setSuccessCriteria] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !objective.trim() || !departmentSlug) return;
    setCreating(true);
    try {
      await api.zamo.missions.create({
        title, objective, department_slug: departmentSlug,
        success_criteria: successCriteria.trim() || undefined,
        created_by: "founder",
      });
      setTitle("");
      setObjective("");
      setSuccessCriteria("");
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  if (activeDepartments.length === 0) {
    return <p className="text-muted text-sm">No departments are active yet — Research is the only implemented department so far.</p>;
  }

  // Bare form fields only — the parent page supplies the glass-panel card, matching
  // MemoryForm's established pattern of card chrome living at the page level.
  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <select
          value={departmentSlug}
          onChange={e => setDepartmentSlug(e.target.value)}
          className="bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white md:col-span-1 focus:outline-none focus:border-accent-2/50"
        >
          {activeDepartments.map(d => <option key={d.slug} value={d.slug} className="bg-black">{d.name}</option>)}
        </select>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Mission title"
          className="bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 md:col-span-3 focus:outline-none focus:border-accent-2/50"
        />
      </div>
      <textarea
        value={objective}
        onChange={e => setObjective(e.target.value)}
        placeholder="Objective — what should this mission accomplish, and why?"
        rows={3}
        className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 resize-none focus:outline-none focus:border-accent-2/50"
      />
      <input
        value={successCriteria}
        onChange={e => setSuccessCriteria(e.target.value)}
        placeholder="Success criteria (optional)"
        className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-accent-2/50"
      />
      <button
        type="submit"
        disabled={creating || !title.trim() || !objective.trim()}
        className="px-4 py-2 rounded-lg font-semibold text-sm bg-accent/20 text-accent border border-accent/40 hover:bg-accent/30 transition disabled:opacity-50"
      >
        {creating ? "Creating…" : "Create Mission"}
      </button>
    </form>
  );
}
