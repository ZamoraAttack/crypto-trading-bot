import { api } from "@/lib/api";
import type { Memory } from "@/lib/api";
import MemoryForm from "@/components/MemoryForm";

export const revalidate = 0;

const CATEGORY_LABELS: Record<string, string> = {
  decision: "Decisions",
  goal: "Goals",
  business_knowledge: "Business Knowledge",
  relationship: "Relationships",
  conversation: "Conversations",
  experiment: "Experiments",
  outcome: "Outcomes",
  agent_history: "Agent History",
};

export default async function MemoryPage() {
  const memories = await api.memory.list({ limit: 100 }).catch(() => [] as Memory[]);

  const byCategory = memories.reduce<Record<string, Memory[]>>((acc, m) => {
    (acc[m.category] ??= []).push(m);
    return acc;
  }, {});

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

      <div>
        <h1 className="text-2xl font-bold text-white">Memory</h1>
        <p className="text-muted text-sm">What ZAMO remembers — decisions, goals, knowledge, relationships, and history</p>
      </div>

      <MemoryForm />

      {memories.length === 0 ? (
        <div className="bg-surface-2 border border-border rounded-2xl p-5">
          <p className="text-muted text-sm text-center">Nothing remembered yet — add a memory above, or ask ZAMO to remember something once voice is live.</p>
        </div>
      ) : (
        Object.entries(byCategory).map(([category, items]) => (
          <div key={category} className="space-y-3">
            <h3 className="text-sm font-semibold text-white">
              {CATEGORY_LABELS[category] ?? category} <span className="text-muted font-normal">({items.length})</span>
            </h3>
            <div className="space-y-2">
              {items.map(m => (
                <div key={m.id} className="bg-surface-2 border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-white text-sm">{m.title}</p>
                    <span className="text-[10px] uppercase tracking-wider text-muted whitespace-nowrap shrink-0">
                      {new Date(m.created_at).toLocaleDateString()} · {m.source}
                    </span>
                  </div>
                  <p className="text-muted text-sm mt-1.5 whitespace-pre-wrap">{m.content}</p>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

    </main>
  );
}
