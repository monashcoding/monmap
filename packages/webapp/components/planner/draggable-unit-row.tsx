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
import {
  canPlaceUnit,
  slotUsedWeight,
  type PlaceBlock,
} from "@/lib/planner/capacity"
import { facultyStyle } from "@/lib/planner/faculty-color"
import { slotCapacity, STANDARD_CP } from "@/lib/planner/types"
import { RatingCompact } from "@/components/reviews/stars"
import { useRating } from "@/components/reviews/use-ratings"
import { cn } from "@/lib/utils"
import { slotLabel } from "@/lib/planner/timeline"

import { usePlanner } from "./planner-context"
import { TOUCH_HIT } from "./touch-target"
import { UnitDetailPopover } from "./unit-detail-popover"

/** What "Add to…" shows for a semester that takes no units. */
const BLOCKED_LABEL: Partial<Record<PlaceBlock, string>> = {
  leave: "On leave",
  exchange: "Exchange",
  locked: "Locked",
  duplicate: "on plan",
}

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
  const rating = useRating("unit", code)
  const fy = isFullYear(code)

  // The unit rides along so a drop can show it before its data loads:
  // a search result isn't in the planner's maps yet.
  const dragData = useMemo(
    () => ({ kind: "new-unit" as const, code, isFullYear: fy, unit }),
    [code, fy, unit]
  )
  const faculty = useMemo(() => facultyStyle(code), [code])
  // Disable drag while either popover is open so the trigger button
  // gets the click instead of dnd-kit starting a drag operation.
  // Being on the plan already does NOT disable it: retaking a failed
  // unit means dragging the same code into a later semester. The
  // reducer still refuses a duplicate inside one slot.
  const dragDisabled = addOpen || detailsOpen
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
        "group/row flex items-stretch overflow-hidden rounded-control border bg-card shadow-card transition-[transform,box-shadow,opacity] duration-200",
        "cursor-grab hover:-translate-y-px active:cursor-grabbing data-[dragging=true]:opacity-30",
        // A long press starts a drag on a phone, not a text selection.
        "max-md:select-none max-md:[-webkit-touch-callout:none]",
        // Dimmed as a hint that it's already somewhere on the plan —
        // still draggable, since a retake is a legitimate second copy.
        placed && "opacity-60"
      )}
    >
      <div aria-hidden className={cn("w-1.5 shrink-0", faculty.railClass)} />

      <div className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1.5 pl-2">
        <UnitDetailPopover code={code} onOpenChangeAction={setDetailsOpen}>
          <button
            type="button"
            aria-label={`Details for ${code}`}
            className="min-w-0 flex-1 rounded-control text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold tabular-nums">{code}</span>
              <span className="text-[9px] text-muted-foreground">
                {unit?.creditPoints ?? STANDARD_CP}cp
              </span>
              {rating ? (
                <RatingCompact summary={rating} className="ml-auto" />
              ) : null}
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
                aria-label={`Add ${code}`}
                className={cn("size-6 shrink-0 rounded-control p-0", TOUCH_HIT)}
              >
                <PlusIcon className="size-3.5" />
              </Button>
            }
          />
          <PopoverContent
            align="end"
            sideOffset={4}
            className="max-h-(--available-height) w-52 overflow-y-auto p-0"
          >
            <div className="shrink-0 border-b px-3 py-2.5">
              <p className="text-xs font-semibold text-muted-foreground">
                Add to…
              </p>
            </div>
            <div className="p-1.5">
              {state.years.map((year, yi) =>
                year.slots.map((slot, si) => {
                  // Blocked per slot, not per plan: the same code twice in
                  // one slot is meaningless, in two slots it's a retake.
                  const place = canPlaceUnit(
                    state,
                    yi,
                    si,
                    code,
                    units,
                    offerings
                  )
                  const full = !place.ok
                  const label = slotLabel(state, yi, slot)
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
                        "flex w-full items-center justify-between rounded-control px-3 py-2 text-left text-sm transition-colors",
                        full
                          ? "cursor-not-allowed opacity-40"
                          : "hover:bg-muted"
                      )}
                    >
                      <span className="truncate">{label}</span>
                      <span className="ml-2 shrink-0 text-[10px] text-muted-foreground tabular-nums">
                        {(!place.ok && BLOCKED_LABEL[place.reason]) ||
                          `${slotUsedWeight(slot, units, offerings)}/${slotCapacity(slot)}`}
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
