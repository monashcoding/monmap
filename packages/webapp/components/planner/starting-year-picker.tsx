"use client"

import { CalendarIcon } from "lucide-react"
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PERIOD_KIND_LABEL } from "@/lib/planner/teaching-period"
import { startLabel, startPeriodOf } from "@/lib/planner/timeline"

import { usePlanner } from "./planner-context"

/**
 * "Starts Semester 1, 2027" pill in the Year 1 header strip. It sets
 * the intake (Semester 1 or 2), which only reorders the study years and
 * keeps every unit, and the handbook year, which is gated by a confirm
 * dialog because switching it clears the plan. Renders as just a
 * calendar icon on narrow screens so the strip's title still fits.
 */
export function StartingYearPicker() {
  const { state, dispatch, availableYears, switchYear } = usePlanner()
  const start = startPeriodOf(state)
  const [pendingYear, setPendingYear] = useState<string | null>(null)

  function handleChange(v: unknown) {
    if (typeof v !== "string" || !v || v === state.courseYear) return
    setPendingYear(v)
  }

  function confirmSwitch() {
    if (pendingYear) void switchYear(pendingYear)
    setPendingYear(null)
  }

  return (
    <>
      <AlertDialog
        open={pendingYear !== null}
        onOpenChange={(open) => {
          if (!open) setPendingYear(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to {pendingYear}?</AlertDialogTitle>
            <AlertDialogDescription>
              Switching the handbook year will clear all units from your
              planner. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSwitch}>
              Switch year
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Starts ${startLabel(state)}. Change intake or handbook year`}
              className="h-6 gap-1.5 rounded-control bg-primary px-2 text-[10px] font-semibold tracking-wide text-primary-foreground uppercase hover:bg-primary/85 hover:text-primary-foreground sm:px-2.5"
            />
          }
        >
          <CalendarIcon className="size-3" />
          <span className="hidden sm:inline">Starts {startLabel(state)}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Intake
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={start}
              onValueChange={(v) =>
                dispatch({
                  type: "set_start_period",
                  period: v === "S2" ? "S2" : "S1",
                })
              }
            >
              <DropdownMenuRadioItem value="S1">
                {PERIOD_KIND_LABEL.S1}
                <span className="ml-auto text-xs text-muted-foreground">
                  Feb
                </span>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="S2">
                {PERIOD_KIND_LABEL.S2}
                <span className="ml-auto text-xs text-muted-foreground">
                  Mid-year
                </span>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Starting year (handbook)
            </DropdownMenuLabel>
            {availableYears.map((y) => (
              <DropdownMenuItem
                key={y}
                disabled={y === state.courseYear}
                onClick={() => handleChange(y)}
              >
                {y}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
