"use client"

import { useDroppable } from "@dnd-kit/core"
import { PlusIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { slotCapacity } from "@/lib/planner/types"
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
 */
export function SemesterSlot({
  yearIndex,
  slotIndex,
}: {
  yearIndex: number
  slotIndex: number
}) {
  const { state } = usePlanner()
  const [open, setOpen] = useState(false)

  const slot = state.years[yearIndex]?.slots[slotIndex]

  const dropData = useMemo(
    () => ({ kind: "slot" as const, yearIndex, slotIndex }),
    [yearIndex, slotIndex]
  )
  const { setNodeRef, isOver, active } = useDroppable({
    id: slotDropId(yearIndex, slotIndex),
    data: dropData,
  })

  if (!slot) return null

  const capacity = slotCapacity(slot)
  const atCapacity = slot.unitCodes.length >= capacity
  const activeData = active?.data.current as
    | { kind: string; yearIndex: number; slotIndex: number; code?: string }
    | undefined
  const isFromSameSlot =
    activeData?.kind === "unit" &&
    activeData.yearIndex === yearIndex &&
    activeData.slotIndex === slotIndex
  const showDropTint = isOver && activeData?.kind === "unit" && !isFromSameSlot

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "grid min-w-0 items-stretch gap-2 p-2 transition-colors duration-150",
        showDropTint && "bg-primary/5"
      )}
      style={{
        gridTemplateColumns: `repeat(${capacity}, minmax(0, 1fr))`,
      }}
    >
      {slot.unitCodes.map((code) => (
        <UnitCard
          key={code}
          code={code}
          yearIndex={yearIndex}
          slotIndex={slotIndex}
        />
      ))}

      {!atCapacity ? (
        <Button
          variant="ghost"
          className="h-[88px] rounded-xl border border-dashed border-border/80 bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setOpen(true)}
        >
          <div className="flex flex-col items-center gap-0.5">
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
