/**
 * Server-rendered placeholder shown while `hydratePlannerUnits()` is
 * resolving on the server. The real Planner streams in via the
 * surrounding <Suspense> boundary in app/page.tsx.
 */
export function PlannerSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading planner"
      className="flex flex-1 flex-col gap-5"
    >
      <div className="h-14 animate-pulse rounded-2xl bg-muted/60" />
      <div className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="h-28 animate-pulse rounded-3xl bg-muted/40" />
          <div className="h-16 animate-pulse rounded-3xl bg-muted/40" />
          <div className="flex flex-col gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-3xl bg-muted/30"
              />
            ))}
          </div>
        </div>
        <div className="h-[600px] animate-pulse rounded-3xl bg-muted/30" />
      </div>
    </div>
  )
}
