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
  const { state, course, dispatch } = usePlanner()
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
      | { kind: "unit"; yearIndex: number; slotIndex: number; code: string }
      | { kind: "slot"; yearIndex: number; slotIndex: number }
      | undefined
    if (!a || !overData) return

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
    if (target && target.unitCodes.length >= slotCapacity(target)) return
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
  const { dispatch } = usePlanner()
  const capacity = slotCapacity(slot)
  const canDecrease = capacity > Math.max(1, slot.unitCodes.length)
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
              {slot.unitCodes.length} / {capacity} units
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
