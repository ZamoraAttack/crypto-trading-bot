export default function PolymarketLoading() {
  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6 text-white">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl glass-tile" />
            <div className="space-y-1.5">
              <SkeletonBar className="h-5 w-28" />
              <SkeletonBar className="h-3 w-40" />
            </div>
          </div>
          <SkeletonBar className="h-6 w-32 rounded-full" />
        </div>

        {/* Portfolio */}
        <section className="space-y-3">
          <SkeletonBar className="h-3 w-20" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiSkeleton /><KpiSkeleton /><KpiSkeleton /><KpiSkeleton />
          </div>
        </section>

        {/* Performance */}
        <section className="space-y-3">
          <SkeletonBar className="h-3 w-24" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiSkeleton /><KpiSkeleton /><KpiSkeleton /><KpiSkeleton />
          </div>
        </section>

        {/* Equity curve */}
        <div className="glass-panel p-5">
          <SkeletonBar className="h-3 w-28 mb-3" />
          <SkeletonBar className="h-40 w-full" />
        </div>

        {/* Trading Intelligence */}
        <div className="glass-panel p-5 space-y-3">
          <SkeletonBar className="h-3 w-44" />
          <SkeletonBar className="h-4 w-full" />
          <SkeletonBar className="h-4 w-2/3" />
        </div>

        {/* Open positions + Recent outcomes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="space-y-3">
            <SkeletonBar className="h-3 w-32" />
            <TableSkeleton rows={3} cols={5} />
          </section>
          <section className="space-y-3">
            <SkeletonBar className="h-3 w-28" />
            <TableSkeleton rows={5} cols={5} />
          </section>
        </div>

        {/* System health */}
        <section className="space-y-2">
          <SkeletonBar className="h-3 w-28" />
          <div className="glass-panel p-4">
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              <RowSkeleton /><RowSkeleton /><RowSkeleton />
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}

// ── Skeleton primitives ──────────────────────────────────────────────────
// Mirrors page.tsx's glass-panel/glass-tile tokens exactly so the shell
// doesn't visibly flash/shift when real content replaces it.

function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`bg-white/10 rounded animate-pulse ${className}`} />;
}

function KpiSkeleton() {
  return (
    <div className="glass-panel p-4 space-y-2">
      <SkeletonBar className="h-2.5 w-20" />
      <SkeletonBar className="h-6 w-24" />
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
      <SkeletonBar className="h-3 w-24" />
    </div>
  );
}

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="glass-panel overflow-hidden">
      <div className="border-b border-white/[0.07] px-4 py-2 flex gap-6">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBar key={i} className="h-3 w-12" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="border-b border-white/[0.04] last:border-0 px-4 py-3 flex gap-6">
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonBar key={c} className="h-3 w-12" />
          ))}
        </div>
      ))}
    </div>
  );
}
