"use client"

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { MinusIcon, MoreVerticalIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  MAX_SLOT_CAPACITY,
  slotCapacity,
  slotUsedWeight,
  type PlannerSlot,
} from "@/lib/planner/types"
import { PERIOD_KIND_LABEL } from "@/lib/planner/teaching-period"

import { usePlanner } from "./planner-context"
import { SemesterSlot } from "./semester-slot"
import { UnitCard } from "./unit-card"

interface ActiveDrag {
  yearIndex: number
  slotIndex: number
  code: string
  isFullYear?: boolean
}

/**
 * Per-year accent gradients. All sit in Monash purple so the strips
 * read as chapter dividers rather than decoration; each year drops a
 * step darker to reinforce "later in the degree = deeper". White
 * text + yellow accent dot gives the strip a badge-like feel without
 * competing with the coloured unit cards below.
 */
const YEAR_GRADIENTS: string[] = [
  "linear-gradient(90deg, #5b2d90 0%, #7b4ab5 100%)",
  "linear-gradient(90deg, #4a248a 0%, #5b2d90 100%)",
  "linear-gradient(90deg, #3a1a63 0%, #4a248a 100%)",
  "linear-gradient(90deg, #2a104f 0%, #3a1a63 100%)",
  "linear-gradient(90deg, #1c0836 0%, #2a104f 100%)",
]

function yearGradient(index: number): string {
  return YEAR_GRADIENTS[Math.min(index, YEAR_GRADIENTS.length - 1)]
}

/**
 * The main planner pane — one row per (year, slot). The left label
 * column carries a three-dot menu that lets a student grow or shrink
 * the slot's unit capacity (1..MAX_SLOT_CAPACITY, never below the
 * units already placed).
 */
export function PlanGrid() {
  const { state, course, dispatch, fullYearCodes, units } = usePlanner()
  const startYear = Number(state.courseYear) || new Date().getFullYear()
  const [active, setActive] = useState<ActiveDrag | null>(null)

  // 6px activation distance lets the unit-detail popover button still
  // fire on a click — only "real" drags engage dnd-kit.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  function onDragStart(e: DragStartEvent) {
    const data = e.active.data.current as ActiveDrag | undefined
    if (data) setActive(data)
  }

  function onDragEnd(e: DragEndEvent) {
    setActive(null)
    const a = e.active.data.current as ActiveDrag | undefined
    const overData = e.over?.data.current as
      | {
          kind: "unit"
          yearIndex: number
          slotIndex: number
          code: string
          isFullYear?: boolean
        }
      | { kind: "slot"; yearIndex: number; slotIndex: number }
      | undefined
    if (!a || !overData) return

    // ── Full-year unit drag rules ─────────────────────────────────
    // FY units occupy both S1[0..N-1] and S2[0..N-1] of their year.
    // Allowed: drop onto any S1 or S2 slot in a *different* year (both
    //   halves move with it).
    // Allowed: swap with another FY in the same year (rotates order).
    // Disallowed: cross-column move within the same year (would
    //   break the twin invariant).
    if (a.isFullYear) {
      if (overData.kind === "unit" && overData.isFullYear) {
        // FY → FY swap. Only meaningful within the same year and only
        // if the target is actually a different code.
        if (overData.code === a.code) return
        if (overData.yearIndex !== a.yearIndex) {
          // Cross-year FY swap is unusual; treat as a move to that year
          // for now and let the user re-order if needed.
          dispatch({
            type: "move_full_year_unit",
            fromYearIndex: a.yearIndex,
            toYearIndex: overData.yearIndex,
            code: a.code,
            fullYearCodes,
          })
          return
        }
        // Same-year reorder — implemented as remove + re-add to put the
        // dragged unit after the target. Simplest correct behaviour.
        dispatch({ type: "remove_full_year_unit", code: a.code })
        dispatch({
          type: "add_full_year_unit",
          yearIndex: a.yearIndex,
          code: a.code,
          fullYearCodes: fullYearCodes.filter((c) => c !== a.code),
        })
        return
      }

      // Drop on empty slot or non-FY card — only allowed if it lands
      // on an S1 or S2 slot in a *different* year. Otherwise reject
      // with a toast explaining why.
      const targetYear = overData.yearIndex
      const targetSlotIndex =
        overData.kind === "slot" ? overData.slotIndex : overData.slotIndex
      const targetSlot = state.years[targetYear]?.slots[targetSlotIndex]
      const targetKind = targetSlot?.kind
      if (targetKind !== "S1" && targetKind !== "S2") {
        toast.info(
          "Year-long units can only sit in S1 + S2 — not in summer or winter slots."
        )
        return
      }
      if (targetYear === a.yearIndex) {
        toast.info(
          `${a.code} is a year-long unit — both halves are locked together. Drag it to another year to move it.`
        )
        return
      }
      // Need room in BOTH semesters of the target year.
      const yr = state.years[targetYear]
      if (!yr) return
      const s1 = yr.slots.find((s) => s.kind === "S1")
      const s2 = yr.slots.find((s) => s.kind === "S2")
      if (!s1 || !s2) {
        toast.info("Target year is missing an S1 or S2 slot.")
        return
      }
      if (
        slotUsedWeight(s1, units) >= slotCapacity(s1) ||
        slotUsedWeight(s2, units) >= slotCapacity(s2)
      ) {
        toast.warning(
          `Not enough room in ${targetYear + 1} — both S1 and S2 need an open slot for a year-long unit.`
        )
        return
      }
      dispatch({
        type: "move_full_year_unit",
        fromYearIndex: a.yearIndex,
        toYearIndex: targetYear,
        code: a.code,
        fullYearCodes,
      })
      return
    }

    // ── Standard (non-FY) drag rules ──────────────────────────────
    // Reject dropping a regular unit onto a FY card — the FY twins
    // are pinned and shouldn't get bumped by an arbitrary swap.
    if (overData.kind === "unit" && overData.isFullYear) {
      toast.info(
        `${overData.code} is a year-long unit and is locked in place. Try a different slot.`
      )
      return
    }

    if (overData.kind === "unit") {
      if (overData.code === a.code) return
      dispatch({
        type: "swap_units",
        a: { yearIndex: a.yearIndex, slotIndex: a.slotIndex, code: a.code },
        b: {
          yearIndex: overData.yearIndex,
          slotIndex: overData.slotIndex,
          code: overData.code,
        },
      })
      return
    }

    // Dropped on empty slot area.
    if (
      a.yearIndex === overData.yearIndex &&
      a.slotIndex === overData.slotIndex
    ) {
      return
    }
    const target = state.years[overData.yearIndex]?.slots[overData.slotIndex]
    if (target && slotUsedWeight(target, units) >= slotCapacity(target)) return
    dispatch({
      type: "move_unit",
      fromYearIndex: a.yearIndex,
      fromSlotIndex: a.slotIndex,
      toYearIndex: overData.yearIndex,
      toSlotIndex: overData.slotIndex,
      code: a.code,
    })
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <div className="flex min-w-0 flex-col gap-0 overflow-hidden rounded-3xl border bg-card shadow-card">
        {state.years.map((year, yearIndex) =>
          year.slots.map((slot, slotIndex) => (
            <SemesterRow
              key={`${yearIndex}:${slotIndex}:${slot.kind}`}
              yearIndex={yearIndex}
              slotIndex={slotIndex}
              slot={slot}
              yearLabel={`${PERIOD_KIND_LABEL[slot.kind]}, ${startYear + yearIndex}`}
              removableYear={state.years.length > 1 && slotIndex === 0}
              onRemoveYear={() => dispatch({ type: "remove_year", yearIndex })}
              showYearHeader={slotIndex === 0}
              yearHeaderLabel={year.label}
            />
          ))
        )}

        {!course ? (
          <div className="px-6 py-10 text-center text-xs text-muted-foreground">
            Pick a course on the right to get started.
          </div>
        ) : null}
      </div>

      <DragOverlay dropAnimation={null}>
        {active ? (
          <UnitCard
            code={active.code}
            yearIndex={active.yearIndex}
            slotIndex={active.slotIndex}
            isDragOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function SemesterRow({
  yearIndex,
  slotIndex,
  slot,
  yearLabel,
  removableYear,
  onRemoveYear,
  showYearHeader,
  yearHeaderLabel,
}: {
  yearIndex: number
  slotIndex: number
  slot: PlannerSlot
  yearLabel: string
  removableYear: boolean
  onRemoveYear: () => void
  showYearHeader: boolean
  yearHeaderLabel: string
}) {
  const { dispatch, units } = usePlanner()
  const capacity = slotCapacity(slot)
  const usedWeight = slotUsedWeight(slot, units)
  const canDecrease = capacity > Math.max(1, usedWeight)
  const canIncrease = capacity < MAX_SLOT_CAPACITY

  return (
    <>
      {showYearHeader ? (
        <div
          className="relative flex items-center justify-between border-b border-white/10 px-4 py-2.5 text-white"
          style={{ backgroundImage: yearGradient(yearIndex) }}
        >
          <h3 className="text-xs font-semibold tracking-[0.12em] text-white uppercase">
            {yearHeaderLabel}
          </h3>
          {removableYear ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove ${yearHeaderLabel}`}
              onClick={onRemoveYear}
              className="text-white/70 hover:bg-white/15 hover:text-white"
            >
              <Trash2Icon />
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="grid grid-cols-[180px_minmax(0,1fr)] items-stretch border-b last:border-b-0">
        <div className="flex items-center justify-between gap-1 border-r bg-muted/20 px-3 py-3 text-[11px] font-medium text-muted-foreground">
          <div className="leading-tight">
            <div>{yearLabel}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground/70 tabular-nums">
              {usedWeight} / {capacity} units
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`${yearLabel} options`}
                  className="shrink-0"
                />
              }
            >
              <MoreVerticalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="right" sideOffset={6}>
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
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <SemesterSlot yearIndex={yearIndex} slotIndex={slotIndex} />
      </div>
    </>
  )
}
