"use client"

import {
  LockIcon,
  LockOpenIcon,
  MinusIcon,
  MoreVerticalIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  MAX_SLOT_CAPACITY,
  slotCapacity,
  slotUsedWeight,
  type PlannerSlot,
} from "@/lib/planner/types"
import { OPTIONAL_SLOT_KINDS } from "@/lib/planner/teaching-period"
import { cn } from "@/lib/utils"

import { usePlanner } from "./planner-context"
import { SemesterSlot } from "./semester-slot"

/**
 * A single (year, slot) row. Layout:
 *   - mobile: stacked vertically — label + meta on top, unit slot below
 *   - desktop: `[180px | 1fr]` grid with label on the left
 *
 * The label cell carries an inline rename, a lock toggle, and a 3-dot
 * menu for capacity changes / slot reset / removal.
 */
export function SemesterRow({
  yearIndex,
  slotIndex,
  slot,
  yearLabel,
}: {
  yearIndex: number
  slotIndex: number
  slot: PlannerSlot
  yearLabel: string
}) {
  const { dispatch, units } = usePlanner()
  const capacity = slotCapacity(slot)
  const usedWeight = slotUsedWeight(slot, units)
  const canDecrease = capacity > Math.max(1, usedWeight)
  const canIncrease = capacity < MAX_SLOT_CAPACITY
  const isOptionalSlot = OPTIONAL_SLOT_KINDS.includes(slot.kind)

  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [labelDraft, setLabelDraft] = useState("")
  const displayLabel = slot.label ?? yearLabel

  function startLabelEdit() {
    setLabelDraft(displayLabel)
    setIsEditingLabel(true)
  }

  function commitLabelEdit() {
    dispatch({ type: "rename_slot", yearIndex, slotIndex, label: labelDraft })
    setIsEditingLabel(false)
  }

  return (
    <div className="grid grid-cols-1 items-stretch border-b last:border-b-0 md:grid-cols-[180px_minmax(0,1fr)]">
      <div
        className={cn(
          "flex items-center justify-between gap-1 border-b px-3 py-2 text-[11px] font-medium text-muted-foreground md:border-r md:border-b-0 md:py-3",
          slot.locked ? "bg-black/[0.08]" : "bg-muted/20"
        )}
      >
        <div className="min-w-0 flex-1 leading-tight">
          {isEditingLabel ? (
            <input
              className="w-full bg-transparent text-[11px] font-medium text-muted-foreground outline-none"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={commitLabelEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitLabelEdit()
                if (e.key === "Escape") setIsEditingLabel(false)
              }}
              autoFocus
            />
          ) : (
            <button
              type="button"
              className="block text-left leading-tight hover:text-foreground"
              onClick={startLabelEdit}
              title="Click to rename"
            >
              {displayLabel}
            </button>
          )}
          <div className="mt-0.5 text-[10px] text-muted-foreground/70 tabular-nums">
            {usedWeight} / {capacity} units
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={slot.locked ? "Unlock semester" : "Lock semester"}
          className="shrink-0"
          onClick={() =>
            dispatch({ type: "toggle_slot_lock", yearIndex, slotIndex })
          }
        >
          {slot.locked ? (
            <LockIcon className="text-foreground/70" />
          ) : (
            <LockOpenIcon />
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`${displayLabel} options`}
                className="shrink-0"
              />
            }
          >
            <MoreVerticalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={!canIncrease}
              onClick={() =>
                dispatch({
                  type: "set_slot_capacity",
                  yearIndex,
                  slotIndex,
                  capacity: capacity + 1,
                })
              }
            >
              <PlusIcon />
              Add a unit slot
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canDecrease}
              onClick={() =>
                dispatch({
                  type: "set_slot_capacity",
                  yearIndex,
                  slotIndex,
                  capacity: capacity - 1,
                })
              }
            >
              <MinusIcon />
              Remove a unit slot
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={slot.unitCodes.length === 0}
              onClick={() =>
                dispatch({ type: "clear_slot", yearIndex, slotIndex })
              }
            >
              <RotateCcwIcon />
              Reset semester
            </DropdownMenuItem>
            {isOptionalSlot ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    dispatch({ type: "remove_slot", yearIndex, slotIndex })
                  }
                >
                  <Trash2Icon />
                  Remove section
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <SemesterSlot yearIndex={yearIndex} slotIndex={slotIndex} />
    </div>
  )
}
