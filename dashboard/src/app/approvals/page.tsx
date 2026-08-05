import { api } from "@/lib/api";
import type { ZamoApproval } from "@/lib/api";
import ApprovalActions from "@/components/ApprovalActions";

export const revalidate = 0;

export default async function ApprovalsPage() {
  const approvals = await api.zamo.approvals.list().catch(() => [] as ZamoApproval[]);
  const pending = approvals.filter(a => a.status === "pending");
  const decided = approvals.filter(a => a.status !== "pending");

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-10">

      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Approval Queue</h1>
        <p className="text-muted text-sm mt-1">The governed boundary between recommendations and authorized execution</p>
      </div>

      {pending.length === 0 ? (
        <div className="glass-panel p-6">
          <p className="text-muted text-sm text-center">
            Nothing pending — Research recommendations are Read-tier and rarely need approval. This queue exists for when a department proposes a Draft or Execute-tier action.
          </p>
        </div>
      ) : (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-[0.15em]">Pending</h3>
          <div className="space-y-2">
            {pending.map(a => (
              <div key={a.id} className="glass-panel glass-panel-hover p-4 space-y-3">
                <div>
                  <p className="text-white text-sm">{a.requested_action}</p>
                  <p className="text-muted text-xs mt-1">Required authority: {a.required_authority}</p>
                </div>
                <ApprovalActions approvalId={a.id} />
              </div>
            ))}
          </div>
        </section>
      )}

      {decided.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-[0.15em]">Decided</h3>
          <div className="space-y-2">
            {decided.map(a => (
              <div key={a.id} className="glass-panel p-4 flex items-center justify-between gap-3">
                <p className="text-white text-sm truncate">{a.requested_action}</p>
                <span className={`text-[10px] uppercase tracking-wider shrink-0 ${a.status === "approved" || a.status === "executed" ? "text-success" : "text-muted"}`}>
                  {a.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

    </main>
  );
}
