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
import {
  isFreshPlan,
  loadOf,
  startLabel,
  startPeriodOf,
  yearsNeeded,
} from "@/lib/planner/timeline"
import { cn } from "@/lib/utils"

import { CoursePicker } from "./course-picker"
import { usePlanner } from "./planner-context"

/**
 * The plan's basics: when the student starts (intake and year) and how
 * much they take per semester. One set of controls, used by the
 * first-run setup card and by the "Starts … · Edit" line under the
 * plan title, so both behave the same way.
 */

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string; hint: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-control border border-input bg-field p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex flex-col items-start rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === o.value
              ? "bg-card font-semibold text-foreground shadow-card"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
          <span className="text-[11px] font-normal text-muted-foreground">
            {o.hint}
          </span>
        </button>
      ))}
    </div>
  )
}

/** Intake, starting year and load. Year changes on a plan with units ask first. */
function BasicsFields({ showLoad = true }: { showLoad?: boolean }) {
  const { state, dispatch, availableYears, switchYear } = usePlanner()
  const [pendingYear, setPendingYear] = useState<string | null>(null)
  const hasUnits = state.years.some((y) =>
    y.slots.some((s) => s.unitCodes.length > 0)
  )

  function chooseYear(y: string) {
    if (y === state.courseYear) return
    // Switching the handbook year clears placed units, so only ask when
    // there is something to lose.
    if (hasUnits) setPendingYear(y)
    else void switchYear(y)
  }

  return (
    <div className="flex flex-col gap-4">
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

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Intake"
          value={startPeriodOf(state)}
          options={[
            { value: "S1", label: "Semester 1", hint: "Starts in February" },
            { value: "S2", label: "Semester 2", hint: "Starts in July" },
          ]}
          onChange={(period) => dispatch({ type: "set_start_period", period })}
        />
        <Select
          value={state.courseYear}
          onValueChange={(v) => {
            if (typeof v === "string") chooseYear(v)
          }}
        >
          <SelectTrigger aria-label="Starting year" className="h-[46px] w-28">
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

      {showLoad ? (
        <Segmented
          label="Study load"
          value={loadOf(state) <= 2 ? "part" : "full"}
          options={[
            { value: "full", label: "Full-time", hint: "4 units a semester" },
            { value: "part", label: "Part-time", hint: "2 units a semester" },
          ]}
          onChange={(v) =>
            dispatch({ type: "set_load", load: v === "part" ? 2 : 4 })
          }
        />
      ) : null}
    </div>
  )
}

function Step({
  n,
  title,
  children,
}: {
  n: number
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 gap-y-2">
      <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {n}
      </span>
      <h3 className="self-center text-sm font-semibold">{title}</h3>
      <div className="col-start-2">{children}</div>
    </section>
  )
}

/**
 * First-run setup, shown in place of the empty grid until the student
 * creates their map or skips. Order matters: the starting year decides
 * which handbook (and so which courses) the picker lists.
 */
export function PlanSetup() {
  const { state, dispatch, course } = usePlanner()

  function create() {
    if (course) {
      dispatch({
        type: "set_year_count",
        count: yearsNeeded(course.creditPoints, loadOf(state)),
      })
    }
    dispatch({ type: "complete_setup" })
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-8 sm:px-8 print:hidden">
      <div>
        <h2 className="text-lg font-semibold">Let&apos;s map your course</h2>
        <p className="text-sm text-muted-foreground">
          Three quick questions, then drag units into your semesters. You can
          change any of this later.
        </p>
      </div>
      <Step n={1} title="When do you start?">
        <BasicsFields showLoad={false} />
      </Step>
      <Step n={2} title="What are you studying?">
        <CoursePicker className="max-w-md border-0 p-0 shadow-none" />
      </Step>
      <Step n={3} title="How many units a semester?">
        <Segmented
          label="Study load"
          value={loadOf(state) <= 2 ? "part" : "full"}
          options={[
            { value: "full", label: "Full-time", hint: "4 units a semester" },
            { value: "part", label: "Part-time", hint: "2 units a semester" },
          ]}
          onChange={(v) =>
            dispatch({ type: "set_load", load: v === "part" ? 2 : 4 })
          }
        />
      </Step>
      <div className="flex flex-wrap items-center gap-3 pl-10">
        <Button onClick={create} disabled={!course}>
          Create my map
        </Button>
        <Button
          variant="ghost"
          onClick={() => dispatch({ type: "complete_setup" })}
        >
          Skip for now
        </Button>
        {!course ? (
          <span className="text-xs text-muted-foreground">
            Pick a course to continue.
          </span>
        ) : null}
      </div>
    </div>
  )
}

/** "Starts Semester 1, 2027 · Full-time · Edit" under the plan title. */
export function PlanBasicsLine() {
  const { state } = usePlanner()
  if (isFreshPlan(state)) return null
  const load = loadOf(state)
  const loadText =
    load >= 4
      ? "Full-time"
      : load <= 2
        ? "Part-time"
        : `${load} units a semester`
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="group/basics inline-flex items-center gap-1.5 rounded-control px-2 py-0.5 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring print:hidden"
          />
        }
      >
        Starts {startLabel(state)} · {loadText}
        <PencilIcon className="size-3 opacity-60 group-hover/basics:opacity-100" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto">
        <BasicsFields />
      </PopoverContent>
    </Popover>
  )
}
