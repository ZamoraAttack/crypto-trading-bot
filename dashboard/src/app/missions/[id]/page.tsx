import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import MissionLiveRefresh from "@/components/MissionLiveRefresh";
import { ArrowLeft } from "lucide-react";

export const revalidate = 0;

const STATE_COLOR: Record<string, string> = {
  proposed: "text-muted", approved: "text-muted", planning: "text-muted",
  delegated: "text-accent-2", in_progress: "text-accent-2",
  waiting: "text-amber-400", blocked: "text-danger",
  review: "text-accent-2", completed: "text-success", learning: "text-success",
  archived: "text-muted",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-muted uppercase tracking-[0.15em]">{title}</h3>
      {children}
    </section>
  );
}

export default async function MissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await api.zamo.missions.get(id).catch(() => null);
  if (!detail) return notFound();

  const { mission, observations, recommendations, approvals, outcome } = detail;

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <MissionLiveRefresh state={mission.state} />

      <Link href="/missions" className="inline-flex items-center gap-1.5 text-muted text-xs hover:text-white transition">
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
        Mission Command
      </Link>

      <div className="glass-panel glass-panel-chamfer p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{mission.title}</h1>
            <p className="text-muted text-xs mt-1">{mission.department_slug.replace(/_/g, " ")} · created by {mission.created_by}</p>
          </div>
          <span className={`text-xs uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full bg-white/[0.06] ${STATE_COLOR[mission.state] ?? "text-muted"}`}>
            {mission.state.replace(/_/g, " ")}
          </span>
        </div>

        {mission.blocked_reason && (
          <div className="glass-panel border-danger/30 p-3">
            <p className="text-danger text-sm">{mission.blocked_reason}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Section title="Objective">
            <p className="text-white text-sm whitespace-pre-wrap">{mission.objective}</p>
          </Section>
          {mission.success_criteria && (
            <Section title="Success Criteria">
              <p className="text-white text-sm whitespace-pre-wrap">{mission.success_criteria}</p>
            </Section>
          )}
        </div>

        <div className="flex gap-6 text-xs text-muted pt-2 border-t border-white/[0.07]">
          <span>Authority: <span className="text-white">{mission.authority_granted}</span></span>
          <span>Priority score: <span className="text-white">{mission.priority_score ?? "—"}</span></span>
          <span>Attempts: <span className="text-white">{mission.attempt_count}</span></span>
        </div>
      </div>

      {observations.length > 0 && (
        <div className="glass-panel p-6 space-y-3">
          <Section title={`Observations (${observations.length})`}>
            <div className="space-y-2">
              {observations.map(o => (
                <div key={o.id} className="glass-tile p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-accent-2 text-xs font-semibold uppercase tracking-wide">{o.source_type}</span>
                    {o.source_reference && <span className="text-muted text-[10px] truncate">{o.source_reference}</span>}
                  </div>
                  <p className="text-white mt-1.5 whitespace-pre-wrap">{o.extracted_evidence}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {recommendations.map(rec => (
        <div key={rec.id} className="glass-panel p-6 space-y-4">
          <Section title="Recommendation">
            <p className="text-white text-sm font-medium">{rec.summary}</p>
            <p className="text-muted text-sm mt-2 whitespace-pre-wrap">{rec.reasoning}</p>
          </Section>
          <Section title="What to Do">
            <p className="text-white text-sm whitespace-pre-wrap">{rec.action_recommended}</p>
          </Section>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-muted">Confidence: <span className="text-white font-semibold">{rec.confidence != null ? `${Math.round(rec.confidence * 100)}%` : "—"}</span></span>
            <span className="text-muted">Approval: <span className={rec.requires_approval ? "text-amber-400" : "text-success"}>{rec.requires_approval ? "Required" : "Not required — Read-tier"}</span></span>
          </div>
          {rec.evidence && rec.evidence.length > 0 && (
            <Section title="Evidence">
              <ul className="text-sm text-muted space-y-1 list-disc list-inside">
                {rec.evidence.map((e, i) => (
                  <li key={i}>Observation #{e.observation_id ?? "?"}{e.note ? ` — ${e.note}` : ""}</li>
                ))}
              </ul>
            </Section>
          )}
          {rec.alternatives_considered && rec.alternatives_considered.length > 0 && (
            <Section title="Alternatives Considered">
              <ul className="text-sm text-muted space-y-1 list-disc list-inside">
                {rec.alternatives_considered.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </Section>
          )}
          {rec.uncertainty && (
            <Section title="Uncertainty">
              <p className="text-muted text-sm">{rec.uncertainty}</p>
            </Section>
          )}
        </div>
      ))}

      {approvals.length > 0 && (
        <div className="glass-panel p-6 space-y-3">
          <Section title="Approvals">
            <div className="space-y-2">
              {approvals.map(a => (
                <div key={a.id} className="glass-tile p-3 text-sm flex items-center justify-between">
                  <span className="text-white">{a.requested_action}</span>
                  <span className="text-xs uppercase tracking-wider text-amber-400">{a.status}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {outcome && (
        <div className="glass-panel p-6 space-y-3">
          <Section title="Outcome & Learning">
            <p className="text-white text-sm whitespace-pre-wrap">{outcome.what_happened}</p>
            {outcome.what_changed && <p className="text-muted text-sm mt-2 whitespace-pre-wrap">{outcome.what_changed}</p>}
            {outcome.lessons && (
              <div className="mt-3 pt-3 border-t border-white/[0.07]">
                <p className="text-xs text-muted uppercase tracking-wide mb-1">Lessons</p>
                <p className="text-white text-sm whitespace-pre-wrap">{outcome.lessons}</p>
              </div>
            )}
          </Section>
        </div>
      )}
    </main>
  );
}
