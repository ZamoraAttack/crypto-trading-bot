import { api } from "@/lib/api";
import type { Memory } from "@/lib/api";
import MemoryForm from "@/components/MemoryForm";
import {
  Lightbulb, Target, Building2, Users, MessageSquare, FlaskConical, CheckCircle2, History, type LucideIcon,
} from "lucide-react";

export const revalidate = 0;

const CATEGORY_META: Record<string, { label: string; icon: LucideIcon }> = {
  decision:           { label: "Decisions",         icon: Lightbulb },
  goal:               { label: "Goals",              icon: Target },
  business_knowledge: { label: "Business Knowledge",  icon: Building2 },
  relationship:       { label: "Relationships",       icon: Users },
  conversation:       { label: "Conversations",       icon: MessageSquare },
  experiment:         { label: "Experiments",         icon: FlaskConical },
  outcome:            { label: "Outcomes",            icon: CheckCircle2 },
  agent_history:      { label: "Agent History",       icon: History },
};

export default async function MemoryPage() {
  const memories = await api.memory.list({ limit: 100 }).catch(() => [] as Memory[]);

  const byCategory = memories.reduce<Record<string, Memory[]>>((acc, m) => {
    (acc[m.category] ??= []).push(m);
    return acc;
  }, {});

  return (
    <main className="max-w-7xl mx-auto px-4 py-8 space-y-10">

      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Memory</h1>
        <p className="text-muted text-sm mt-1">What ZAMO remembers — decisions, goals, knowledge, relationships, and history</p>
      </div>

      <div className="glass-panel glass-panel-chamfer p-5 space-y-3">
        <h3 className="text-xs font-bold text-white uppercase tracking-wide">Remember Something</h3>
        <MemoryForm />
      </div>

      {memories.length === 0 ? (
        <div className="glass-panel p-6">
          <p className="text-muted text-sm text-center">Nothing remembered yet — add a memory above, or ask ZAMO to remember something via voice or text.</p>
        </div>
      ) : (
        Object.entries(byCategory).map(([category, items]) => {
          const meta = CATEGORY_META[category];
          const Icon = meta?.icon ?? Lightbulb;
          return (
            <section key={category} className="space-y-3">
              <h3 className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-[0.15em]">
                <Icon className="w-3.5 h-3.5 text-accent-2" strokeWidth={1.75} />
                {meta?.label ?? category}
                <span className="text-white/70 normal-case tracking-normal">({items.length})</span>
              </h3>
              <div className="space-y-2">
                {items.map(m => (
                  <div key={m.id} className="glass-panel glass-panel-hover p-4">
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
            </section>
          );
        })
      )}

    </main>
  );
}
