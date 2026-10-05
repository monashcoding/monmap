"use client"

import { facultyStyle } from "@/lib/planner/faculty-color"
import { slotLabel } from "@/lib/planner/timeline"
import { DEFAULT_SLOT_CAPACITY, type PlannerState } from "@/lib/planner/types"
import { cn } from "@/lib/utils"

/**
 * Compact at-a-glance grid showing every placed unit code in faculty
 * colour, organised by semester. Scrolls horizontally if the year has
 * more slots than fit; vertical scroll if there are many years.
 */
export function PlanPreview({ state }: { state: PlannerState }) {
  const maxCols = state.years.reduce(
    (max, year) =>
      year.slots.reduce(
        (m, slot) =>
          Math.max(
            m,
            slot.capacity ?? DEFAULT_SLOT_CAPACITY,
            slot.unitCodes.length
          ),
        max
      ),
    DEFAULT_SLOT_CAPACITY
  )

  const CELL_W = 72

  return (
    <div className="max-h-[220px] overflow-x-auto overflow-y-auto pr-1">
      <div className="flex min-w-max flex-col gap-1">
        {state.years.map((year, yi) =>
          year.slots.map((slot, si) => {
            const label = slotLabel(state, yi, slot)
            return (
              <div key={`${yi}:${si}`} className="flex items-center gap-1.5">
                <div
                  className="shrink-0 text-right text-[10px] leading-tight text-muted-foreground/70"
                  style={{ width: 112 }}
                >
                  {label}
                </div>
                <div className="flex gap-1">
                  {Array.from({ length: maxCols }, (_, i) => {
                    const code = slot.unitCodes[i]
                    if (!code) {
                      return (
                        <div
                          key={i}
                          className="shrink-0 rounded-tag border border-dashed border-border bg-muted/40"
                          style={{ width: CELL_W, height: 26 }}
                        />
                      )
                    }
                    const fs = facultyStyle(code)
                    return (
                      <div
                        key={i}
                        className="flex shrink-0 items-center overflow-hidden rounded-tag border border-border/60 bg-card"
                        style={{ width: CELL_W, height: 26 }}
                      >
                        <div
                          className={cn(
                            "w-[3px] shrink-0 self-stretch",
                            fs.railClass
                          )}
                        />
                        <span className="truncate px-1.5 text-[10px] font-semibold tabular-nums">
                          {code}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
