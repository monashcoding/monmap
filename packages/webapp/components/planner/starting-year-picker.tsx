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
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { usePlanner } from "./planner-context"

/**
 * Compact pill that lets the student switch the handbook year for the
 * whole plan, gated by a confirm dialog (year-switch wipes the plan).
 * Lives in the Year 1 header strip; renders as just a calendar icon on
 * narrow screens so the strip's title still fits.
 */
export function StartingYearPicker() {
  const { state, availableYears, switchYear } = usePlanner()
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
              aria-label="Change starting year"
              className="h-6 gap-1.5 rounded-full bg-white px-2 text-[10px] font-semibold tracking-wide text-foreground uppercase hover:bg-white/90 hover:text-foreground sm:px-2.5"
            />
          }
        >
          <CalendarIcon className="size-3" />
          <span className="hidden sm:inline">Change starting year</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {availableYears.map((y) => (
            <DropdownMenuItem
              key={y}
              disabled={y === state.courseYear}
              onClick={() => handleChange(y)}
            >
              {y}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
