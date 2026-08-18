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

  // Repeating a unit is legitimate (you failed it and took it again),
  // so this is a note, not an error — it exists to make an *accidental*
  // double-add visible and to explain the credit-point maths.
  return (
    <section className="rounded-3xl border border-border bg-muted/40 px-5 py-3">
      <p className="text-[11px] text-muted-foreground">
        Repeated {summary.duplicateUnitCodes.length === 1 ? "unit" : "units"}:{" "}
        {summary.duplicateUnitCodes.join(", ")}. Counted once toward your degree
        total.
      </p>
    </section>
  )
}
