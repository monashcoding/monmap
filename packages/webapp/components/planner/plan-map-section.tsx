"use client"

import { useMemo, useState } from "react"

import { Checkbox } from "@/components/ui/checkbox"

import { PlanMap } from "./plan-map"
import { usePlanner } from "./planner-context"
import { useWam } from "./wam-context"

/**
 * The planner's plan map, below the plan on wide screens. It only
 * shows the plan; editing stays in the grid above.
 */
export function PlanMapSection() {
  const { state, course, units } = usePlanner()
  const { grades } = useWam()
  // Off by default: the map is about the student's own units.
  const [showUntaken, setShowUntaken] = useState(false)

  // Units the course and the picked areas of study list, so the map
  // can show the ones the plan leaves out.
  const requirementCodes = useMemo(() => {
    if (!course) return []
    const picked = new Set(Object.values(state.selectedAos).filter(Boolean))
    return [
      ...course.courseUnits.map((u) => u.code),
      ...course.componentCourses.flatMap((cc) =>
        cc.courseUnits.map((u) => u.code)
      ),
      ...course.areasOfStudy
        .filter((a) => picked.has(a.code))
        .flatMap((a) => a.units.map((u) => u.code)),
    ]
  }, [course, state.selectedAos])

  return (
    <section className="hidden flex-col overflow-hidden rounded-panel border bg-card shadow-card lg:flex print:hidden">
      <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Plan map</h2>
        {requirementCodes.length > 0 ? (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
            <Checkbox
              checked={showUntaken}
              onCheckedChange={(checked) => setShowUntaken(checked)}
            />
            Show units not in plan
          </label>
        ) : null}
      </div>
      {/* Toggling changes the map's units, which remounts it and fits
          the new set (see PlanMap). */}
      <PlanMap
        state={state}
        requirementCodes={showUntaken ? requirementCodes : undefined}
        knownUnits={units}
        grades={grades}
        className="h-[640px] min-h-0 rounded-none border-0 shadow-none"
      />
    </section>
  )
}
