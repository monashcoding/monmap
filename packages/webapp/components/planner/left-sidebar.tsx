"use client"

import {
  BadgeCheckIcon,
  CalculatorIcon,
  DownloadIcon,
  PlusCircleIcon,
  PrinterIcon,
  RotateCcwIcon,
  TagIcon,
  UploadIcon,
} from "lucide-react"
import { useCallback, useMemo, useRef } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import type { PlannerState } from "@/lib/planner/types"

import { usePlanner } from "./planner-context"
import { useWam } from "./wam-context"

/**
 * Vertical action rail, left side. Matches the MonPlan floating
 * sidebar idiom — four discoverable verbs as icon buttons with
 * text labels. State-only operations (no server round-trip).
 */
export function LeftSidebar() {
  const { state, dispatch, validations, switchCourse, flashErrors } =
    usePlanner()
  const { wamMode, showGrade, toggleWamMode, toggleShowGrade } = useWam()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const errorCount = useMemo(() => {
    let n = 0
    for (const v of validations.values()) n += v.errors.length
    return n
  }, [validations])

  const onReset = useCallback(() => {
    if (!confirm("Reset the whole plan? This clears every unit you've placed."))
      return
    const prevCourse = state.courseCode
    dispatch({ type: "reset" })
    if (prevCourse) void switchCourse(prevCourse)
  }, [dispatch, state.courseCode, switchCourse])

  const onExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `monmap-plan-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Plan exported")
  }, [state])

  const onImport = useCallback(
    async (file: File) => {
      try {
        const text = await file.text()
        const parsed = JSON.parse(text) as PlannerState
        if (!parsed || !Array.isArray(parsed.years)) {
          throw new Error("File isn't a monmap plan")
        }
        dispatch({ type: "hydrate", state: parsed })
        if (parsed.courseCode) void switchCourse(parsed.courseCode)
        toast.success("Plan imported")
      } catch (err) {
        toast.error("Couldn't import plan", {
          description: err instanceof Error ? err.message : "Unknown error",
        })
      }
    },
    [dispatch, switchCourse]
  )

  const onPrint = useCallback(() => {
    window.print()
  }, [])

  return (
    <aside className="flex flex-row flex-wrap items-center gap-1 self-start rounded-3xl border bg-card p-2 shadow-card print:hidden">
      <ActionButton
        icon={<BadgeCheckIcon />}
        label="Validate"
        tone={errorCount === 0 ? "good" : "bad"}
        onClick={() => {
          if (errorCount === 0) {
            toast.success("Plan validates cleanly", {
              description:
                "Every unit meets its prereqs and is offered in its slot.",
            })
            return
          }
          flashErrors()
        }}
      />

      <ActionButton
        icon={<PlusCircleIcon />}
        label="Add year"
        onClick={() => dispatch({ type: "add_year" })}
      />

      <ActionButton icon={<DownloadIcon />} label="Export" onClick={onExport} />

      <ActionButton
        icon={<UploadIcon />}
        label="Import"
        onClick={() => fileInputRef.current?.click()}
      />

      <ActionButton icon={<PrinterIcon />} label="Print" onClick={onPrint} />

      <ActionButton icon={<RotateCcwIcon />} label="Reset" onClick={onReset} />

      <div className="mx-1 h-8 w-px bg-border" />

      <ActionButton
        icon={<CalculatorIcon />}
        label="WAM"
        tone={wamMode ? "active" : undefined}
        onClick={toggleWamMode}
      />
      <ActionButton
        icon={<TagIcon />}
        label="Show Grades"
        tone={showGrade ? "active" : undefined}
        onClick={toggleShowGrade}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onImport(f)
          e.target.value = ""
        }}
      />
    </aside>
  )
}

function ActionButton({
  icon,
  label,
  tone,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  tone?: "good" | "bad" | "active"
  onClick: () => void
}) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className="flex h-auto flex-col items-center gap-1 rounded-2xl px-3 py-2 text-xs"
    >
      <span
        className={
          tone === "good"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "bad"
              ? "text-destructive"
              : tone === "active"
                ? "text-primary"
                : "text-foreground"
        }
      >
        {icon}
      </span>
      <span
        className={`text-[10px] leading-none font-medium${tone === "active" ? "text-primary" : ""}`}
      >
        {label}
      </span>
    </Button>
  )
}
