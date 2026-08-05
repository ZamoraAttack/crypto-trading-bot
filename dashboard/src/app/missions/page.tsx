import Link from "next/link";
import { api } from "@/lib/api";
import type { ZamoDepartment, ZamoMission } from "@/lib/api";
import MissionForm from "@/components/MissionForm";

export const revalidate = 0;

const STATE_COLOR: Record<string, string> = {
  proposed: "text-muted", approved: "text-muted", planning: "text-muted",
  delegated: "text-accent-2", in_progress: "text-accent-2",
  waiting: "text-amber-400", blocked: "text-danger",
  review: "text-accent-2", completed: "text-success", learning: "text-success",
  archived: "text-muted",
};

export default async function MissionsPage() {
  const [missions, departments] = await Promise.all([
    api.zamo.missions.list().catch(() => [] as ZamoMission[]),
    api.zamo.departments().catch(() => [] as ZamoDepartment[]),
  ]);

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-10">

      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Mission Command</h1>
        <p className="text-muted text-sm mt-1">The Mission Control Loop — objectives ZAMO has delegated to a department</p>
      </div>

      <div className="glass-panel glass-panel-chamfer p-5 space-y-3">
        <h3 className="text-xs font-bold text-white uppercase tracking-wide">New Mission</h3>
        <MissionForm departments={departments} />
      </div>

      {missions.length === 0 ? (
        <div className="glass-panel p-6">
          <p className="text-muted text-sm text-center">No missions yet — create one above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {missions.map(m => (
            <Link key={m.id} href={`/missions/${m.id}`} className="block glass-panel glass-panel-hover p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-white text-sm truncate">{m.title}</p>
                  <p className="text-muted text-xs mt-1 line-clamp-2">{m.objective}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`text-[10px] uppercase tracking-wider font-semibold ${STATE_COLOR[m.state] ?? "text-muted"}`}>
                    {m.state.replace(/_/g, " ")}
                  </span>
                  <p className="text-[10px] text-muted/70 mt-1">{m.department_slug.replace(/_/g, " ")}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

    </main>
  );
}
