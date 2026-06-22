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

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
  const { dispatch, units, offerings } = usePlanner()
  const capacity = slotCapacity(slot)
  const usedWeight = slotUsedWeight(slot, units, offerings)
  const canDecrease = capacity > Math.max(1, usedWeight)
  const canIncrease = capacity < MAX_SLOT_CAPACITY
  const hasUnits = slot.unitCodes.length > 0

  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [labelDraft, setLabelDraft] = useState("")
  const [pendingAction, setPendingAction] = useState<"reset" | "remove" | null>(
    null
  )
  const displayLabel = slot.label ?? yearLabel

  function requestReset() {
    if (!hasUnits) return
    setPendingAction("reset")
  }

  function requestRemove() {
    if (hasUnits) {
      setPendingAction("remove")
      return
    }
    dispatch({ type: "remove_slot", yearIndex, slotIndex })
  }

  function confirmPending() {
    if (pendingAction === "reset") {
      dispatch({ type: "clear_slot", yearIndex, slotIndex })
    } else if (pendingAction === "remove") {
      dispatch({ type: "remove_slot", yearIndex, slotIndex })
    }
    setPendingAction(null)
  }

  function startLabelEdit() {
    setLabelDraft(displayLabel)
    setIsEditingLabel(true)
  }

  function commitLabelEdit() {
    dispatch({ type: "rename_slot", yearIndex, slotIndex, label: labelDraft })
    setIsEditingLabel(false)
  }

  return (
    <>
      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction === "reset"
                ? `Reset ${displayLabel}?`
                : `Remove ${displayLabel}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction === "reset"
                ? `All ${slot.unitCodes.length} unit${slot.unitCodes.length === 1 ? "" : "s"} in this semester will be removed. You can undo this.`
                : `This section and its ${slot.unitCodes.length} unit${slot.unitCodes.length === 1 ? "" : "s"} will be removed. You can undo this.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={confirmPending}
            >
              {pendingAction === "reset" ? "Reset semester" : "Remove section"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
              <DropdownMenuItem disabled={!hasUnits} onClick={requestReset}>
                <RotateCcwIcon />
                Reset semester
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={requestRemove}>
                <Trash2Icon />
                Remove section
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <SemesterSlot yearIndex={yearIndex} slotIndex={slotIndex} />
      </div>
    </>
  )
}
