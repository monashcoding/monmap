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
import { PlusIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { slotCapacity, slotUsedWeight } from "@/lib/planner/types"
import { PERIOD_KIND_LABEL } from "@/lib/planner/teaching-period"

import { usePlanner } from "./planner-context"
import { SemesterRow } from "./semester-row"
import { UnitCard } from "./unit-card"
import { YearHeader } from "./year-header"

type ActiveDrag =
  | {
      kind: "unit"
      yearIndex: number
      slotIndex: number
      code: string
      isFullYear?: boolean
    }
  | {
      kind: "new-unit"
      code: string
      isFullYear?: boolean
    }

/**
 * Wraps any children in a single dnd-kit context, so drags from the
 * sidebar (Add units / Templates) can drop onto grid slots in the
 * same context as in-grid moves and swaps.
 */
export function PlannerDnd({ children }: { children: React.ReactNode }) {
  const { state, dispatch, fullYearCodes, units, addUnit, plannedCodes } =
    usePlanner()
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

    // ── Drag from sidebar (new-unit) ───────────────────────────────
    if (a.kind === "new-unit") {
      if (plannedCodes.has(a.code)) return
      const targetYearIdx = overData.yearIndex
      const targetSlotIdx = overData.slotIndex
      const target = state.years[targetYearIdx]?.slots[targetSlotIdx]
      if (!target || target.locked) return
      if (a.isFullYear) {
        // FY needs S1+S2 of one year with both halves free.
        const yr = state.years[targetYearIdx]
        const s1 = yr?.slots.find((s) => s.kind === "S1")
        const s2 = yr?.slots.find((s) => s.kind === "S2")
        if (!s1 || !s2) {
          toast.info(
            "Year-long units need both S1 and S2 — that year is missing one."
          )
          return
        }
        if (
          slotUsedWeight(s1, units) >= slotCapacity(s1) ||
          slotUsedWeight(s2, units) >= slotCapacity(s2)
        ) {
          toast.warning(
            "Not enough room — S1 and S2 both need an open slot for a year-long unit."
          )
          return
        }
        addUnit(targetYearIdx, targetSlotIdx, a.code)
        return
      }
      if (slotUsedWeight(target, units) >= slotCapacity(target)) {
        toast.warning("That slot is full.")
        return
      }
      addUnit(targetYearIdx, targetSlotIdx, a.code)
      return
    }

    // Block drags from or to locked slots.
    const fromSlot = state.years[a.yearIndex]?.slots[a.slotIndex]
    const toSlot = state.years[overData.yearIndex]?.slots[overData.slotIndex]
    if (fromSlot?.locked || toSlot?.locked) return

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
      {children}
      <DragOverlay dropAnimation={null}>
        {active ? (
          active.kind === "new-unit" ? (
            <NewUnitDragOverlay code={active.code} />
          ) : (
            <UnitCard
              code={active.code}
              yearIndex={active.yearIndex}
              slotIndex={active.slotIndex}
              isDragOverlay
            />
          )
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function NewUnitDragOverlay({ code }: { code: string }) {
  const { units } = usePlanner()
  const unit = units.get(code)
  return (
    <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 shadow-2xl ring-2 ring-primary/40">
      <span className="text-xs font-semibold tabular-nums">{code}</span>
      {unit ? (
        <span className="text-[9px] text-muted-foreground">
          {unit.creditPoints}cp
        </span>
      ) : null}
      {unit ? (
        <span className="max-w-[160px] truncate text-[11px] text-muted-foreground">
          {unit.title}
        </span>
      ) : null}
    </div>
  )
}

/**
 * The main planner pane — one row per (year, slot), grouped by year
 * header. Renders the structural shell; per-row logic lives in
 * `SemesterRow`, per-year strip in `YearHeader`.
 *
 * On mobile (<md) the row reflows to a vertical stack (label on top,
 * unit slot below). On desktop, the label sits in a 180px left column.
 */
export function PlanGrid() {
  const { state, course, dispatch } = usePlanner()
  const startYear = Number(state.courseYear) || new Date().getFullYear()

  return (
    <div className="flex min-w-0 flex-col gap-0 overflow-hidden rounded-2xl border bg-card shadow-card sm:rounded-3xl">
      {state.years.map((year, yearIndex) => (
        <div key={yearIndex} className="flex flex-col">
          <YearHeader
            yearIndex={yearIndex}
            calYear={startYear + yearIndex}
            yearLabel={year.label}
            yearSlotKinds={year.slots.map((s) => s.kind)}
            removableYear={state.years.length > 1}
            yearHasUnits={year.slots.some((s) => s.unitCodes.length > 0)}
          />
          {year.slots.map((slot, slotIndex) => (
            <SemesterRow
              key={`${yearIndex}:${slotIndex}:${slot.kind}`}
              yearIndex={yearIndex}
              slotIndex={slotIndex}
              slot={slot}
              yearLabel={`${PERIOD_KIND_LABEL[slot.kind]}, ${startYear + yearIndex}`}
            />
          ))}
        </div>
      ))}

      {!course ? (
        <div className="px-6 py-10 text-center text-xs text-muted-foreground">
          Pick a course on the right to get started.
        </div>
      ) : (
        <button
          type="button"
          onClick={() => dispatch({ type: "add_year" })}
          className="flex items-center justify-center gap-1.5 border-t border-dashed bg-muted/20 px-4 py-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <PlusIcon className="size-3.5" />
          Add year
        </button>
      )}
    </div>
  )
}
