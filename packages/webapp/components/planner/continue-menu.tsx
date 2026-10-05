"use client"

import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PERIOD_KIND_LABEL } from "@/lib/planner/teaching-period"
import {
  primaryOrder,
  slotCalendarYear,
  sortSlots,
  startPeriodOf,
  studyYearSpan,
} from "@/lib/planner/timeline"
import type { PeriodKind } from "@/lib/planner/types"
import { cn } from "@/lib/utils"

import { usePlanner } from "./planner-context"

const OPTIONAL_KINDS: PeriodKind[] = ["SUMMER_A", "SUMMER_B", "WINTER"]

/**
 * "Continue" menu for extending the plan: it offers what comes next on
 * the timeline instead of a fixed "Add year". The last year's missing
 * semester, another study year, a final half year, and the summer or
 * winter periods the last year doesn't have yet, each with its real
 * calendar year.
 */
export function ContinueMenu({
  variant,
  className,
}: {
  variant: "toolbar" | "footer"
  className?: string
}) {
  const { state, dispatch } = usePlanner()
  const start = startPeriodOf(state)
  const [first, second] = primaryOrder(start)
  const lastIndex = state.years.length - 1
  const last = state.years[lastIndex]
  const lastKinds = new Set(last?.slots.map((s) => s.kind) ?? [])
  const nextIndex = state.years.length
  const nextYearNo = nextIndex + 1

  const missingSecond = last && lastKinds.has(first) && !lastKinds.has(second)
  const optional = last
    ? sortSlots(
        OPTIONAL_KINDS.filter((k) => !lastKinds.has(k)).map((kind) => ({
          kind,
        })),
        start
      )
    : []
  const label = (yearIndex: number, kind: PeriodKind) =>
    `${PERIOD_KIND_LABEL[kind]}, ${slotCalendarYear(state, yearIndex, kind)}`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          variant === "toolbar" ? (
            <Button variant="ghost" size="sm" className={className} />
          ) : (
            <button
              type="button"
              className={cn(
                "flex w-full items-center justify-center gap-1.5 border-t border-dashed bg-muted/20 px-4 py-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase transition-colors outline-none hover:bg-muted/40 hover:text-foreground focus-visible:bg-muted/40",
                className
              )}
            />
          )
        }
      >
        <PlusIcon className={variant === "footer" ? "size-3.5" : undefined} />
        Continue
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={variant === "toolbar" ? "end" : "center"}
        className="w-64"
      >
        {missingSecond ? (
          <DropdownMenuItem
            onClick={() =>
              dispatch({
                type: "add_optional_slot",
                yearIndex: lastIndex,
                kind: second,
              })
            }
          >
            {label(lastIndex, second)}
            <span className="ml-auto text-xs text-muted-foreground">
              Year {lastIndex + 1}
            </span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => dispatch({ type: "add_year" })}>
          Year {nextYearNo}
          <span className="ml-auto text-xs text-muted-foreground">
            {studyYearSpan(state, nextIndex)}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => dispatch({ type: "add_year", only: "first" })}
        >
          Just {label(nextIndex, first)}
          <span className="ml-auto text-xs text-muted-foreground">
            Finish mid-year
          </span>
        </DropdownMenuItem>
        {optional.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Add to Year {lastIndex + 1}
            </DropdownMenuLabel>
            {optional.map(({ kind }) => (
              <DropdownMenuItem
                key={kind}
                onClick={() =>
                  dispatch({
                    type: "add_optional_slot",
                    yearIndex: lastIndex,
                    kind,
                  })
                }
              >
                {label(lastIndex, kind)}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
