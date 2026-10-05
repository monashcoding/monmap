"use client"

import { PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ADDABLE_SLOT_KINDS } from "@/lib/planner/teaching-period"
import {
  slotLabel,
  sortSlots,
  startPeriodOf,
  studyYearSpan,
} from "@/lib/planner/timeline"
import type { PeriodKind } from "@/lib/planner/types"
import { cn } from "@/lib/utils"

import { usePlanner } from "./planner-context"
import { TOUCH_HIT_ROW } from "./touch-target"

/**
 * Header strip for a single study year — the charcoal banner above the
 * year's slots. Carries the year label, calendar year, reset/add/remove
 * controls. The intake and starting year live in the plan header.
 */
export function YearHeader({
  yearIndex,
  yearLabel,
  yearSlotKinds,
  removableYear,
  yearHasUnits,
}: {
  yearIndex: number
  yearLabel: string
  yearSlotKinds: PeriodKind[]
  removableYear: boolean
  yearHasUnits: boolean
}) {
  const { state, dispatch } = usePlanner()
  const span = studyYearSpan(state, yearIndex)
  // Menu in time order for this intake, each with its real calendar year.
  const addable = sortSlots(
    ADDABLE_SLOT_KINDS.map((kind) => ({ kind })),
    startPeriodOf(state)
  ).map(({ kind }) => ({
    kind,
    label: slotLabel(state, yearIndex, { kind }),
  }))
  return (
    <div className="relative flex items-center justify-between gap-2 border-b border-white/10 bg-year-strip px-3 py-2.5 text-white sm:px-4">
      <h3 className="flex min-w-0 items-center truncate text-[11px] font-semibold tracking-[0.12em] text-white uppercase sm:text-xs">
        {yearLabel}
        <span className="ml-1.5 font-medium text-white/55">({span})</span>
      </h3>
      <div className="flex shrink-0 items-center gap-2 md:gap-1">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Reset ${yearLabel}`}
          disabled={!yearHasUnits}
          onClick={() => dispatch({ type: "clear_year", yearIndex })}
          className={cn(
            "text-white/70 hover:bg-white/15 hover:text-white disabled:opacity-30",
            TOUCH_HIT_ROW
          )}
        >
          <RotateCcwIcon />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Add a term to ${yearLabel}`}
                title="Add summer, winter or another term"
                className={cn(
                  "text-white/70 hover:bg-white/15 hover:text-white",
                  TOUCH_HIT_ROW
                )}
              />
            }
          >
            <PlusIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {addable.map(({ kind, label }) => (
              <DropdownMenuItem
                key={kind}
                disabled={yearSlotKinds.includes(kind)}
                onClick={() =>
                  dispatch({ type: "add_optional_slot", yearIndex, kind })
                }
              >
                {label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                dispatch({
                  type: "add_optional_slot",
                  yearIndex,
                  kind: "OTHER",
                  label: `Untitled, ${span}`,
                })
              }
            >
              Untitled, {span}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {removableYear ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${yearLabel}`}
            onClick={() => dispatch({ type: "remove_year", yearIndex })}
            className={cn(
              "text-white/70 hover:bg-white/15 hover:text-white",
              TOUCH_HIT_ROW
            )}
          >
            <Trash2Icon />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
