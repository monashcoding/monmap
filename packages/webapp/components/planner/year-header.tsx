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
import { PERIOD_KIND_LABEL } from "@/lib/planner/teaching-period"
import type { PeriodKind } from "@/lib/planner/types"

import { usePlanner } from "./planner-context"
import { StartingYearPicker } from "./starting-year-picker"

const ADDABLE_SLOT_KINDS: PeriodKind[] = [
  "S1",
  "S2",
  "SUMMER_A",
  "SUMMER_B",
  "WINTER",
]

/**
 * Header strip for a single study year — the charcoal banner above the
 * year's slots. Carries the year label, calendar year, reset/add/remove
 * controls and (for Year 1) the handbook-year picker.
 */
export function YearHeader({
  yearIndex,
  calYear,
  yearLabel,
  yearSlotKinds,
  removableYear,
  yearHasUnits,
}: {
  yearIndex: number
  calYear: number
  yearLabel: string
  yearSlotKinds: PeriodKind[]
  removableYear: boolean
  yearHasUnits: boolean
}) {
  const { dispatch } = usePlanner()
  return (
    <div className="relative flex items-center justify-between gap-2 border-b border-white/10 bg-year-strip px-3 py-2.5 text-white sm:px-4">
      <h3 className="flex min-w-0 items-center truncate text-[11px] font-semibold tracking-[0.12em] text-white uppercase sm:text-xs">
        <span
          aria-hidden
          className="mr-2 size-1.5 shrink-0 rounded-full bg-primary"
        />
        {yearLabel}
        <span className="ml-1.5">({calYear})</span>
      </h3>
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        {yearIndex === 0 ? <StartingYearPicker /> : null}
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Reset ${yearLabel}`}
          disabled={!yearHasUnits}
          onClick={() => dispatch({ type: "clear_year", yearIndex })}
          className="text-white/70 hover:bg-white/15 hover:text-white disabled:opacity-30"
        >
          <RotateCcwIcon />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Add section"
                className="text-white/70 hover:bg-white/15 hover:text-white"
              />
            }
          >
            <PlusIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {ADDABLE_SLOT_KINDS.map((kind) => (
              <DropdownMenuItem
                key={kind}
                disabled={yearSlotKinds.includes(kind)}
                onClick={() =>
                  dispatch({ type: "add_optional_slot", yearIndex, kind })
                }
              >
                {PERIOD_KIND_LABEL[kind]}, {calYear}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                dispatch({
                  type: "add_optional_slot",
                  yearIndex,
                  kind: "OTHER",
                  label: `Untitled, ${calYear}`,
                })
              }
            >
              Untitled, {calYear}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {removableYear ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${yearLabel}`}
            onClick={() => dispatch({ type: "remove_year", yearIndex })}
            className="text-white/70 hover:bg-white/15 hover:text-white"
          >
            <Trash2Icon />
          </Button>
        ) : null}
      </div>
    </div>
  )
}
