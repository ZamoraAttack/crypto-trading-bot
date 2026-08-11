export default function PolymarketLoading() {
  return (
    <div className="min-h-screen bg-[#0F1117]">
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6 text-[#E6EDF3]">

        <div>
          <h1 className="text-2xl font-bold text-[#E6EDF3]">Polymarket Bot</h1>
          <p className="text-[#6B7280] text-sm">Copy-trade bot · Prediction markets</p>
        </div>

        {/* KPI row 1 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiSkeleton /><KpiSkeleton /><KpiSkeleton /><KpiSkeleton />
        </div>

        {/* KPI row 2 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiSkeleton /><KpiSkeleton /><KpiSkeleton /><KpiSkeleton />
        </div>

        {/* Equity curve */}
        <Card>
          <SkeletonBar className="h-4 w-32 mb-4" />
          <SkeletonBar className="h-40 w-full" />
        </Card>

        {/* Open positions */}
        <section>
          <SkeletonBar className="h-4 w-40 mb-3" />
          <TableSkeleton rows={3} cols={6} />
        </section>

        {/* Risk & Exposure + System Health */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <SkeletonBar className="h-4 w-32 mb-3" />
            <div className="space-y-3">
              <RowSkeleton /><RowSkeleton /><RowSkeleton /><RowSkeleton /><RowSkeleton />
            </div>
          </Card>
          <Card>
            <SkeletonBar className="h-4 w-28 mb-3" />
            <div className="space-y-3">
              <RowSkeleton /><RowSkeleton /><RowSkeleton /><RowSkeleton /><RowSkeleton />
            </div>
          </Card>
        </div>

        {/* Recent activity */}
        <section>
          <SkeletonBar className="h-4 w-48 mb-3" />
          <TableSkeleton rows={5} cols={6} />
        </section>

      </main>
    </div>
  );
}

// ── Skeleton primitives ──────────────────────────────────────────────────
// Mirrors page.tsx's Card/layout tokens exactly (#161B22 card, #2A2F3A
// border) so the shell doesn't visibly flash/shift when real content
// replaces it.

function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`bg-[#2A2F3A] rounded animate-pulse ${className}`} />;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#161B22] border border-[#2A2F3A] rounded-xl p-4">
      {children}
    </div>
  );
}

function KpiSkeleton() {
  return (
    <Card>
      <SkeletonBar className="h-3 w-20 mb-2" />
      <SkeletonBar className="h-6 w-24" />
    </Card>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center justify-between">
      <SkeletonBar className="h-3 w-28" />
      <SkeletonBar className="h-3 w-16" />
    </div>
  );
}

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="bg-[#161B22] border border-[#2A2F3A] rounded-xl overflow-hidden">
      <div className="border-b border-[#2A2F3A] px-4 py-2 flex gap-6">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBar key={i} className="h-3 w-14" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="border-b border-[#2A2F3A]/60 px-4 py-3 flex gap-6">
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonBar key={c} className="h-3 w-14" />
          ))}
        </div>
      ))}
    </div>
  );
}
