"use client"

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { useState } from "react"
import { toast } from "sonner"

import { canPlaceUnit, type PlaceBlock } from "@/lib/planner/capacity"
import { isFreshPlan, slotLabel, studyYearName } from "@/lib/planner/timeline"
import type { PlannerUnit } from "@/lib/planner/types"

import { usePlanner } from "./planner-context"
import { SemesterRow } from "./semester-row"
import { AddSemesterButton, FinishLine } from "./finish-line"
import { PlanSetup } from "./plan-basics"
import { UnitCard } from "./unit-card"
import { UnitSearchProvider } from "./unit-search-dialog"
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
      /** Set when the unit may not be in the planner's maps yet. */
      unit?: PlannerUnit
    }

/** Why a drop was refused, as a toast. Nothing for a missing slot. */
function toastBlocked(reason: PlaceBlock, code: string, fullYear: boolean) {
  switch (reason) {
    case "no_twin":
      toast.info(
        "Year-long units need both S1 and S2 - that year is missing one."
      )
      return
    case "full":
      toast.warning(
        fullYear
          ? "Not enough room - S1 and S2 both need an open slot for a year-long unit."
          : "That slot is full."
      )
      return
    case "locked":
      toast.info("That semester is locked. Unlock it to change its units.")
      return
    case "leave":
      toast.info("That semester is a leave of absence, so it takes no units.")
      return
    case "exchange":
      toast.info("That semester is on exchange, so it takes no units.")
      return
    case "duplicate":
      toast.info(
        fullYear
          ? `${code} is already in that year.`
          : `${code} is already in that semester.`
      )
      return
  }
}

/**
 * Wraps any children in a single dnd-kit context, so drags from the
 * sidebar (Add units / Templates) can drop onto grid slots in the
 * same context as in-grid moves and swaps.
 */
export function PlannerDnd({ children }: { children: React.ReactNode }) {
  const {
    state,
    dispatch,
    fullYearCodes,
    units,
    offerings,
    addUnit,
    mergeUnitData,
  } = usePlanner()
  const [active, setActive] = useState<ActiveDrag | null>(null)

  // Mouse: a 6px activation distance lets the unit-detail popover
  // button still fire on a click — only "real" drags engage dnd-kit.
  // Touch: a drag starts only after a 250ms press, so a swipe over a
  // card scrolls the page. The card menu's "Move to" is the tap
  // alternative.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    })
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
    // Refused per slot, not per plan — the same code twice in one slot
    // is meaningless, but in a later semester it's a retake after a
    // fail, which students do.
    if (a.kind === "new-unit") {
      const { yearIndex, slotIndex } = overData
      const place = canPlaceUnit(
        state,
        yearIndex,
        slotIndex,
        a.code,
        units,
        offerings
      )
      if (!place.ok) {
        toastBlocked(place.reason, a.code, !!a.isFullYear)
        return
      }
      if (a.unit && !units.has(a.code))
        mergeUnitData({
          units: { [a.code]: a.unit },
          offerings: {},
          requisites: {},
        })
      addUnit(yearIndex, slotIndex, a.code)
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
        // Same-year reorder: the dragged unit takes the target's place
        // in both halves, in one undo step.
        dispatch({
          type: "move_full_year_unit",
          fromYearIndex: a.yearIndex,
          toYearIndex: a.yearIndex,
          code: a.code,
          targetCode: overData.code,
          fullYearCodes,
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
          "Year-long units can only sit in S1 + S2 - not in summer or winter slots."
        )
        return
      }
      if (targetYear === a.yearIndex) {
        toast.info(
          `${a.code} is a year-long unit - both halves are locked together. Drag it to another year to move it.`
        )
        return
      }
      // Need room in BOTH semesters of the target year.
      const place = canPlaceUnit(
        state,
        targetYear,
        targetSlotIndex,
        a.code,
        units,
        offerings
      )
      if (!place.ok) {
        toastBlocked(place.reason, a.code, true)
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
    const place = canPlaceUnit(
      state,
      overData.yearIndex,
      overData.slotIndex,
      a.code,
      units,
      offerings
    )
    if (!place.ok) {
      toastBlocked(place.reason, a.code, false)
      return
    }
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
            <NewUnitDragOverlay code={active.code} dragged={active.unit} />
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

function NewUnitDragOverlay({
  code,
  dragged,
}: {
  code: string
  dragged: PlannerUnit | undefined
}) {
  const { units } = usePlanner()
  const unit = dragged ?? units.get(code)
  return (
    <div className="flex items-center gap-2 rounded-control border bg-card px-3 py-2 shadow-2xl ring-2 ring-primary/40">
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
  const { state, course } = usePlanner()

  // A plan nobody has started gets the three-question setup instead of
  // an empty grid.
  if (isFreshPlan(state)) return <PlanSetup />

  return (
    <UnitSearchProvider>
      <div className="flex min-w-0 flex-col gap-0">
        {state.years.map((year, yearIndex) => (
          <div key={yearIndex} className="flex flex-col">
            <YearHeader
              yearIndex={yearIndex}
              yearLabel={studyYearName(yearIndex)}
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
                yearLabel={slotLabel(state, yearIndex, slot)}
              />
            ))}
          </div>
        ))}

        {!course ? (
          <div className="px-6 py-10 text-center text-xs text-muted-foreground">
            {/* Phones have the course panel in a sheet, not on the right. */}
            <span className="md:hidden">
              Tap the button at the bottom right to pick a course.
            </span>
            <span className="hidden md:inline">
              Pick a course on the right to get started.
            </span>
          </div>
        ) : (
          <>
            <FinishLine />
            <AddSemesterButton />
          </>
        )}
      </div>
    </UnitSearchProvider>
  )
}
