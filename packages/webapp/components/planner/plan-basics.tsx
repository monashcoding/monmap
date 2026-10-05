"use client"

import { PencilIcon } from "lucide-react"
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  isFreshPlan,
  startLabel,
  startPeriodOf,
  yearsNeeded,
} from "@/lib/planner/timeline"

import { CoursePicker } from "./course-picker"
import { usePlanner } from "./planner-context"

/**
 * When the student starts: intake (Semester 1 or 2) and starting year.
 * One set of controls, used by the first-run setup card and by the
 * "Starts …" control beside the plan title. Changing the year on a plan
 * with units asks first, because each year has its own handbook.
 */
function StartFields() {
  const { state, dispatch, availableYears, switchYear } = usePlanner()
  const [pendingYear, setPendingYear] = useState<string | null>(null)
  const hasUnits = state.years.some((y) =>
    y.slots.some((s) => s.unitCodes.length > 0)
  )

  function chooseYear(y: string) {
    if (y === state.courseYear) return
    if (hasUnits) setPendingYear(y)
    else void switchYear(y)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <AlertDialog
        open={pendingYear !== null}
        onOpenChange={(open) => {
          if (!open) setPendingYear(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start in {pendingYear}?</AlertDialogTitle>
            <AlertDialogDescription>
              Each starting year has its own handbook, so changing it clears the
              units in your plan. You can undo this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingYear) void switchYear(pendingYear)
                setPendingYear(null)
              }}
            >
              Change year
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Tabs
        value={startPeriodOf(state)}
        onValueChange={(v) =>
          dispatch({
            type: "set_start_period",
            period: v === "S2" ? "S2" : "S1",
          })
        }
      >
        <TabsList aria-label="Intake">
          <TabsTrigger value="S1">Semester 1</TabsTrigger>
          <TabsTrigger value="S2">Semester 2</TabsTrigger>
        </TabsList>
      </Tabs>
      <Select
        value={state.courseYear}
        onValueChange={(v) => {
          if (typeof v === "string") chooseYear(v)
        }}
      >
        <SelectTrigger aria-label="Starting year" className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[...availableYears].reverse().map((y) => (
            <SelectItem key={y} value={y}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * First-run setup, shown in place of the empty grid until the student
 * creates their map or skips. The starting year comes first because it
 * decides which handbook, and so which courses, the picker lists.
 */
export function PlanSetup() {
  const { dispatch, course } = usePlanner()

  function create() {
    if (course) {
      dispatch({
        type: "set_year_count",
        count: yearsNeeded(course.creditPoints),
      })
    }
    dispatch({ type: "complete_setup" })
  }

  return (
    <div className="flex flex-col gap-5 px-4 py-6 sm:px-6 print:hidden">
      <div>
        <h2 className="text-base font-semibold">Let&apos;s map your course</h2>
        <p className="text-sm text-muted-foreground">
          Two quick questions, then drag units into your semesters. You can
          change either later.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          When do you start?
        </span>
        <StartFields />
      </div>
      <div className="flex max-w-md flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          What are you studying?
        </span>
        <CoursePicker className="border-0 p-0 shadow-none [&>label]:hidden" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={create} disabled={!course}>
          Create my map
        </Button>
        <Button
          variant="ghost"
          onClick={() => dispatch({ type: "complete_setup" })}
        >
          Skip for now
        </Button>
      </div>
    </div>
  )
}

/** "Starts Semester 1, 2027" beside the plan title; opens StartFields. */
export function PlanStartControl() {
  const { state } = usePlanner()
  if (isFreshPlan(state)) return null
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="group/start inline-flex shrink-0 items-center gap-1.5 rounded-control px-2 py-1 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring print:hidden"
          />
        }
      >
        Starts {startLabel(state)}
        <PencilIcon className="size-3 opacity-60 group-hover/start:opacity-100" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <StartFields />
      </PopoverContent>
    </Popover>
  )
}
