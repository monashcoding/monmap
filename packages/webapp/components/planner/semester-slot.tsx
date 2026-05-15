"use client"

import { useDroppable } from "@dnd-kit/core"
import { PlusIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { useIsMobile } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import { slotCapacity, slotUsedWeight, STANDARD_CP } from "@/lib/planner/types"
import { cn } from "@/lib/utils"

import { usePlanner } from "./planner-context"
import { UnitCard } from "./unit-card"
import { UnitSearchDialog } from "./unit-search-dialog"

export function slotDropId(yearIndex: number, slotIndex: number): string {
  return `slot:${yearIndex}:${slotIndex}`
}

/**
 * Row of unit cards for a single (year, slot). The "Add unit"
 * affordance only shows when the slot has room — capacity per slot
 * is editable from the slot's three-dot menu in the left rail.
 *
 * Layout:
 *  - mobile (<md): one card per row, stacked vertically
 *  - desktop:      grid sized to slot capacity, with multi-cp units
 *                  spanning multiple columns
 */
export function SemesterSlot({
  yearIndex,
  slotIndex,
}: {
  yearIndex: number
  slotIndex: number
}) {
  const { state, units } = usePlanner()
  const [open, setOpen] = useState(false)
  const isMobile = useIsMobile()

  const slot = state.years[yearIndex]?.slots[slotIndex]

  const dropData = useMemo(
    () => ({ kind: "slot" as const, yearIndex, slotIndex }),
    [yearIndex, slotIndex]
  )
  const { setNodeRef, isOver, active } = useDroppable({
    id: slotDropId(yearIndex, slotIndex),
    data: dropData,
    disabled: !!slot.locked,
  })

  if (!slot) return null

  const capacity = slotCapacity(slot)
  const usedWeight = slotUsedWeight(slot, units)
  const atCapacity = usedWeight >= capacity
  const activeData = active?.data.current as
    | { kind: string; yearIndex: number; slotIndex: number; code?: string }
    | undefined
  const isFromSameSlot =
    activeData?.kind === "unit" &&
    activeData.yearIndex === yearIndex &&
    activeData.slotIndex === slotIndex
  const showDropTint = isOver && activeData?.kind === "unit" && !isFromSameSlot

  // Per-unit column spans derived from credit points.
  const unitSpans = slot.unitCodes.map((code) => {
    const cp = units.get(code)?.creditPoints ?? STANDARD_CP
    return Math.max(1, Math.round(cp / STANDARD_CP))
  })
  const placedSpan = unitSpans.reduce((sum, s) => sum + s, 0)
  // Column count must fit all placed spans plus the add button (if visible),
  // but never collapse below the declared capacity.
  const totalColumns = Math.max(capacity, placedSpan + (atCapacity ? 0 : 1))

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-w-0 items-stretch gap-2 p-2 transition-colors duration-150",
        "min-h-[104px]",
        // Mobile: vertical stack so each card has comfortable width.
        // Desktop: capacity-sized grid (one card per column).
        isMobile ? "flex flex-col" : "grid",
        slot.locked ? "bg-black/[0.05]" : showDropTint && "bg-primary/5"
      )}
      style={
        isMobile
          ? undefined
          : { gridTemplateColumns: `repeat(${totalColumns}, minmax(0, 1fr))` }
      }
    >
      {slot.unitCodes.map((code, i) => (
        <div
          key={code}
          style={isMobile ? undefined : { gridColumn: `span ${unitSpans[i]}` }}
        >
          <UnitCard code={code} yearIndex={yearIndex} slotIndex={slotIndex} />
        </div>
      ))}

      {!atCapacity && !slot.locked ? (
        <Button
          variant="ghost"
          className={cn(
            "rounded-xl border border-dashed border-border/80 bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
            isMobile ? "h-12 w-full" : "h-[88px]"
          )}
          onClick={() => setOpen(true)}
        >
          <div className="flex items-center gap-1.5 sm:flex-col sm:gap-0.5">
            <PlusIcon className="size-4" />
            <span className="text-[10px] tracking-wide uppercase">
              Add unit
            </span>
          </div>
        </Button>
      ) : null}

      <UnitSearchDialog
        open={open}
        onOpenChange={setOpen}
        yearIndex={yearIndex}
        slotIndex={slotIndex}
      />
    </div>
  )
}
