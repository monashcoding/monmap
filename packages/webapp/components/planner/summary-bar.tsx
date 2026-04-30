"use client"

import { LayersIcon } from "lucide-react"
import { useMemo } from "react"

import { cn } from "@/lib/utils"
import { summarizePlan } from "@/lib/planner/progress"

import { usePlanner } from "./planner-context"

/**
 * Thin credit-point + validation banner above the grid. Intentionally
 * compact — the sidebars do the heavy lifting; this is just the
 * at-a-glance summary.
 */
export function SummaryBar() {
  const { state, course, units, offerings, validations } = usePlanner()

  const summary = useMemo(
    () => summarizePlan(state, course, units, offerings),
    [state, course, units, offerings]
  )

  const errorCount = useMemo(() => {
    let e = 0
    for (const v of validations.values()) e += v.errors.length
    return e
  }, [validations])

  const pct = Math.min(
    100,
    summary.targetCreditPoints
      ? Math.round(
          (summary.totalCreditPoints / summary.targetCreditPoints) * 100
        )
      : 0
  )

  return (
    <section className="flex flex-wrap items-center gap-5 rounded-3xl border bg-card px-5 py-3 shadow-card">
      <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
            Credit points planned
          </span>
          <span className="text-xs tabular-nums">
            <span className="text-sm font-semibold text-foreground">
              {summary.totalCreditPoints}
            </span>
            <span className="text-muted-foreground">
              {" "}
              / {summary.targetCreditPoints}
            </span>
          </span>
        </div>
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-500 ease-out",
              errorCount === 0 ? "bg-emerald-500" : "bg-amber-500"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <Stat
        icon={<LayersIcon className="size-3.5" />}
        label="Units"
        value={String(summary.uniqueUnitCount)}
      />

      {summary.duplicateUnitCodes.length > 0 ? (
        <div className="basis-full text-[11px] text-destructive">
          Duplicate placements: {summary.duplicateUnitCodes.join(", ")}. Units
          should appear once.
        </div>
      ) : null}
    </section>
  )
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-7 items-center justify-center rounded-xl bg-muted">
        {icon}
      </div>
      <div className="leading-tight">
        <div className="text-[9px] tracking-wide text-muted-foreground uppercase">
          {label}
        </div>
        <div className="text-xs font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  )
}
