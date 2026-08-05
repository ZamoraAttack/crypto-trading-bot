import { api } from "@/lib/api";
import type { ZamoDepartment } from "@/lib/api";
import {
  Search, Megaphone, Landmark, Cog, HeartHandshake, MessagesSquare, Wrench, type LucideIcon,
} from "lucide-react";

export const revalidate = 0;

// Ch6 roster — Payroll deliberately excluded (it's a future business/client
// of ZAMO, not a department; see intelligence/seed.py).
const DEPARTMENT_META: Record<string, { icon: LucideIcon }> = {
  research: { icon: Search },
  marketing: { icon: Megaphone },
  finance: { icon: Landmark },
  operations: { icon: Cog },
  relationship_management: { icon: HeartHandshake },
  customer_discovery: { icon: MessagesSquare },
  engineering: { icon: Wrench },
};

export default async function DepartmentsPage() {
  const departments = await api.zamo.departments().catch(() => [] as ZamoDepartment[]);

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-10">

      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Departments</h1>
        <p className="text-muted text-sm mt-1">Executive Departments — specialized capabilities ZAMO coordinates, not agents it manages directly</p>
      </div>

      {departments.length === 0 ? (
        <div className="glass-panel p-6">
          <p className="text-muted text-sm text-center">No departments found — the backend may not have seeded them yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map(d => {
            const Icon = DEPARTMENT_META[d.slug]?.icon ?? Cog;
            const active = d.status === "active";
            return (
              <div key={d.slug} className="glass-panel glass-panel-hover p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="w-10 h-10 shrink-0 rounded-lg glass-tile flex items-center justify-center">
                    <Icon className="w-[18px] h-[18px] text-accent-2" strokeWidth={1.75} />
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${active ? "bg-success/20 text-success" : "bg-white/[0.06] text-muted"}`}>
                    {active ? "Active" : "Planned"}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">{d.name}</p>
                  <p className="text-muted text-xs mt-1">
                    {active
                      ? `${d.active_mission_count} active mission${d.active_mission_count === 1 ? "" : "s"}`
                      : "Not yet implemented"}
                  </p>
                </div>
                {d.last_activity_at && (
                  <p className="text-[10px] text-muted/70">
                    Last activity {new Date(d.last_activity_at).toLocaleString()}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

    </main>
  );
}
