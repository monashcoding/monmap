"use client"

import { useMemo } from "react"

import { summarizePlan } from "@/lib/planner/progress"

import { usePlanner } from "./planner-context"

export function SummaryBar() {
  const { state, course, units, offerings } = usePlanner()

  const summary = useMemo(
    () => summarizePlan(state, course, units, offerings),
    [state, course, units, offerings]
  )

  if (summary.duplicateUnitCodes.length === 0) return null

  return (
    <section className="rounded-3xl border border-destructive/30 bg-destructive/5 px-5 py-3">
      <p className="text-[11px] text-destructive">
        Duplicate placements: {summary.duplicateUnitCodes.join(", ")}. Each unit
        should appear once.
      </p>
    </section>
  )
}
