"use client"

import { useDraggable } from "@dnd-kit/core"
import { PlusIcon } from "lucide-react"
import { useCallback, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { facultyStyle } from "@/lib/planner/faculty-color"
import { PERIOD_KIND_LABEL } from "@/lib/planner/teaching-period"
import { slotCapacity, slotUsedWeight } from "@/lib/planner/types"
import { cn } from "@/lib/utils"

import { usePlanner } from "./planner-context"
import { UnitDetailPopover } from "./unit-detail-popover"

/**
 * Compact unit row used by both the search panel and the templates
 * panel. Draggable into any planner slot; tap the body to open unit
 * details, or use the `+` popover for keyboard / non-pointer adds.
 */
export function DraggableUnitRow({ code }: { code: string }) {
  const { state, units, offerings, addUnit, isFullYear, plannedCodes } =
    usePlanner()
  const [addOpen, setAddOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const placed = plannedCodes.has(code)
  const unit = units.get(code)
  const fy = isFullYear(code)
  const startYear = Number(state.courseYear) || new Date().getFullYear()

  const dragData = useMemo(
    () => ({ kind: "new-unit" as const, code, isFullYear: fy }),
    [code, fy]
  )
  const faculty = useMemo(() => facultyStyle(code), [code])
  // Disable drag while either popover is open so the trigger button
  // gets the click instead of dnd-kit starting a drag operation.
  const dragDisabled = placed || addOpen || detailsOpen
  const draggable = useDraggable({
    id: `new:${code}`,
    data: dragData,
    disabled: dragDisabled,
  })
  const setRef = useCallback(
    (node: HTMLElement | null) => draggable.setNodeRef(node),
    [draggable]
  )
  const isBeingDragged = draggable.isDragging
  const dragListeners = dragDisabled ? undefined : draggable.listeners
  const dragAttributes = dragDisabled ? undefined : draggable.attributes

  return (
    <div
      ref={setRef}
      data-dragging={isBeingDragged ? "true" : undefined}
      {...dragListeners}
      {...dragAttributes}
      className={cn(
        "group/row flex items-stretch overflow-hidden rounded-xl border bg-background shadow-card transition-[transform,box-shadow,opacity] duration-200",
        placed
          ? "opacity-50"
          : "cursor-grab hover:-translate-y-px active:cursor-grabbing data-[dragging=true]:opacity-30"
      )}
    >
      <div aria-hidden className={cn("w-1.5 shrink-0", faculty.railClass)} />

      <div className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1.5 pl-2">
        <UnitDetailPopover code={code} onOpenChangeAction={setDetailsOpen}>
          <button
            type="button"
            aria-label={`Details for ${code}`}
            className="min-w-0 flex-1 rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold tabular-nums">{code}</span>
              <span className="text-[9px] text-muted-foreground">
                {unit?.creditPoints ?? 6}cp
              </span>
            </div>
            {unit ? (
              <p className="truncate text-[11px] text-muted-foreground">
                {unit.title}
              </p>
            ) : null}
          </button>
        </UnitDetailPopover>

        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger
            render={
              <Button
                size="sm"
                variant="ghost"
                disabled={placed}
                aria-label={`Add ${code}`}
                className="size-6 shrink-0 rounded-lg p-0"
              >
                <PlusIcon className="size-3.5" />
              </Button>
            }
          />
          <PopoverContent align="end" sideOffset={4} className="w-52 p-0">
            <div className="border-b px-3 py-2.5">
              <p className="text-xs font-semibold text-muted-foreground">
                Add to…
              </p>
            </div>
            <div className="p-1.5">
              {state.years.map((year, yi) =>
                year.slots.map((slot, si) => {
                  const cap = slotCapacity(slot)
                  const used = slotUsedWeight(slot, units, offerings)
                  const full = used >= cap
                  const label =
                    slot.label ??
                    `${PERIOD_KIND_LABEL[slot.kind]}, ${startYear + yi}`
                  return (
                    <button
                      key={`${yi}:${si}`}
                      type="button"
                      disabled={full}
                      onClick={() => {
                        addUnit(yi, si, code)
                        setAddOpen(false)
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
                        full
                          ? "cursor-not-allowed opacity-40"
                          : "hover:bg-muted"
                      )}
                    >
                      <span className="truncate">{label}</span>
                      <span className="ml-2 shrink-0 text-[10px] text-muted-foreground tabular-nums">
                        {used}/{cap}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
