"use client"

import { FlagIcon, PlusIcon } from "lucide-react"
import { useMemo } from "react"

import { Button } from "@/components/ui/button"
import { summarizePlan } from "@/lib/planner/progress"
import {
  nextSemesters,
  slotBlockCredit,
  slotLabel,
} from "@/lib/planner/timeline"
import { slotCapacity, slotUsedWeight } from "@/lib/planner/types"

import { usePlanner } from "./planner-context"

const CP_PER_UNIT = 6

/**
 * Finish-line projection under the grid. When the plan already reaches
 * the course's credit points it says in which semester; otherwise it
 * works out how many more semesters the remaining points need at the
 * student's usual load, when that lands, and offers to add them.
 */
/**
 * Add the next `n` semesters after the end of the plan: a missing
 * semester goes into its existing year, new years come in whole, and a
 * new year that only needs its first semester comes in as a half year.
 */
export function useAddSemesters() {
  const { state, dispatch } = usePlanner()
  return (n: number) => {
    const byYear = new Map<number, Set<"S1" | "S2">>()
    for (const pos of nextSemesters(state, n)) {
      const kinds = byYear.get(pos.yearIndex) ?? new Set()
      kinds.add(pos.kind)
      byYear.set(pos.yearIndex, kinds)
    }
    for (const [yearIndex, kinds] of [...byYear].sort((x, y) => x[0] - y[0])) {
      if (yearIndex < state.years.length) {
        for (const kind of kinds)
          dispatch({ type: "add_optional_slot", yearIndex, kind })
      } else {
        dispatch({
          type: "add_year",
          only: kinds.size === 1 ? "first" : undefined,
        })
      }
    }
  }
}

/** "＋ Add Semester 1, 2029": the one way to extend the plan. */
export function AddSemesterButton() {
  const { state } = usePlanner()
  const addSemesters = useAddSemesters()
  const next = nextSemesters(state, 1)[0]!
  const label = slotLabel(state, next.yearIndex, { kind: next.kind })
  return (
    <button
      type="button"
      onClick={() => addSemesters(1)}
      className="flex w-full items-center justify-center gap-1.5 border-t border-dashed bg-muted/20 px-4 py-3 text-xs font-medium text-muted-foreground transition-colors outline-none hover:bg-muted/40 hover:text-foreground focus-visible:bg-muted/40 print:hidden"
    >
      <PlusIcon className="size-3.5" />
      Add {label}
    </button>
  )
}

export function FinishLine() {
  const { state, course, units, offerings } = usePlanner()
  const addSemesters = useAddSemesters()

  const projection = useMemo(() => {
    if (!course) return null
    const summary = summarizePlan(state, course, units, offerings)
    const target = summary.targetCreditPoints
    if (target <= 0) return null

    // Credit points in plan order, counting each code once (retakes and
    // full-year twins add load, not credit), plus exchange blocks.
    // Advanced standing is whatever the summary has beyond the slots.
    const counted = new Set<string>()
    const perSlot: Array<{ yearIndex: number; slotIndex: number; cp: number }> =
      []
    let slotsTotal = 0
    state.years.forEach((y, yearIndex) =>
      y.slots.forEach((slot, slotIndex) => {
        let cp = slotBlockCredit(slot)
        for (const code of slot.unitCodes) {
          if (counted.has(code)) continue
          counted.add(code)
          cp += units.get(code)?.creditPoints ?? 0
        }
        slotsTotal += cp
        perSlot.push({ yearIndex, slotIndex, cp })
      })
    )
    let running = summary.totalCreditPoints - slotsTotal
    for (const p of perSlot) {
      running += p.cp
      if (running >= target) {
        const slot = state.years[p.yearIndex]!.slots[p.slotIndex]!
        return {
          kind: "reached" as const,
          target,
          when: slotLabel(state, p.yearIndex, slot),
        }
      }
    }

    const remaining = target - summary.totalCreditPoints
    // Room left in semesters the plan already has.
    let free = 0
    const loads: number[] = []
    for (const y of state.years)
      for (const slot of y.slots) {
        if (slot.status || (slot.kind !== "S1" && slot.kind !== "S2")) continue
        loads.push(slotCapacity(slot))
        free += Math.max(
          0,
          slotCapacity(slot) - slotUsedWeight(slot, units, offerings)
        )
      }
    const freeCp = free * CP_PER_UNIT
    if (freeCp >= remaining) {
      return { kind: "room" as const, remaining }
    }
    const load =
      Math.round(
        loads.length ? loads.reduce((a, b) => a + b, 0) / loads.length : 4
      ) || 4
    const extra = remaining - freeCp
    const semesters = Math.ceil(extra / (load * CP_PER_UNIT))
    const ahead = nextSemesters(state, semesters)
    const lastAhead = ahead.at(-1)!
    return {
      kind: "short" as const,
      remaining,
      load,
      semesters,
      when: slotLabel(state, lastAhead.yearIndex, { kind: lastAhead.kind }),
    }
  }, [state, course, units, offerings])

  if (!projection) return null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-3 text-xs text-muted-foreground">
      <FlagIcon className="size-3.5 shrink-0 text-foreground" />
      {projection.kind === "reached" ? (
        <span>
          Reaches {projection.target} credit points in{" "}
          <span className="font-semibold text-foreground">
            {projection.when}
          </span>
          .
        </span>
      ) : projection.kind === "room" ? (
        <span>
          {projection.remaining} credit points to go, and there&apos;s room for
          them in the semesters you already have.
        </span>
      ) : (
        <>
          <span>
            {projection.remaining} credit points to go: about{" "}
            {projection.semesters} more semester
            {projection.semesters === 1 ? "" : "s"} at {projection.load} units,
            finishing around{" "}
            <span className="font-semibold text-foreground">
              {projection.when}
            </span>
            .
          </span>
          <Button
            variant="outline"
            size="xs"
            onClick={() => addSemesters(projection.semesters)}
          >
            Add {projection.semesters === 1 ? "it" : "them"}
          </Button>
        </>
      )}
    </div>
  )
}
