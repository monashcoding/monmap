"use client"

import {
  BadgeCheckIcon,
  CalculatorIcon,
  DownloadIcon,
  FileTextIcon,
  PlusCircleIcon,
  PrinterIcon,
  Redo2Icon,
  RotateCcwIcon,
  TagIcon,
  Undo2Icon,
  UploadIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  const {
    state,
    dispatch,
    validations,
    switchCourse,
    flashErrors,
    plans,
    activePlanId,
    currentUser,
    renamePlan,
    undo,
    redo,
    canUndo,
    canRedo,
  } = usePlanner()
  const activePlan = plans.find((p) => p.id === activePlanId)

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(activePlan?.name ?? "")

  useEffect(() => {
    // Sync the draft from the source-of-truth plan name whenever the
    // plan changes underneath us (switch plan, rename from elsewhere).
    // Skip while the user is actively editing — their keystrokes win.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!editingName) setNameDraft(activePlan?.name ?? "")
  }, [activePlan?.name, editingName])

  const commitNameEdit = useCallback(() => {
    if (!activePlan) return
    const trimmed = nameDraft.trim()
    setEditingName(false)
    if (!trimmed || trimmed === activePlan.name) return
    void renamePlan(activePlan.id, trimmed)
  }, [activePlan, nameDraft, renamePlan])

  const cancelNameEdit = useCallback(() => {
    setNameDraft(activePlan?.name ?? "")
    setEditingName(false)
  }, [activePlan?.name])
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
    dispatch({ type: "reset" })
  }, [dispatch])

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
          throw new Error("File isn't a MonMap plan")
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
    <div className="flex flex-col gap-1 self-start sm:flex-row sm:flex-wrap sm:items-start sm:gap-2 print:hidden">
      <aside className="flex flex-col gap-1 self-start rounded-2xl border bg-card p-1.5 shadow-card sm:flex-row sm:flex-wrap sm:items-center sm:gap-1 sm:rounded-3xl sm:p-2">
        {currentUser && activePlan ? (
          <>
            {editingName ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitNameEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitNameEdit()
                  if (e.key === "Escape") cancelNameEdit()
                }}
                className="w-full max-w-full rounded px-3 py-2 text-xs font-semibold ring-1 ring-primary outline-none focus:ring-2 sm:w-auto sm:max-w-[220px]"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                title={`Rename "${activePlan.name}"`}
                className="w-full max-w-full cursor-text truncate rounded px-3 py-2 text-left text-xs font-semibold hover:bg-muted/60 sm:w-auto sm:max-w-[220px]"
              >
                {activePlan.name}
              </button>
            )}
            <div className="mx-1 hidden h-8 w-px bg-border sm:block" />
          </>
        ) : null}

        <div className="flex flex-wrap items-center gap-0.5 sm:gap-1">
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

          <ActionButton
            icon={<UploadIcon />}
            label="Export"
            onClick={onExport}
          />

          <ActionButton
            icon={<DownloadIcon />}
            label="Import"
            onClick={() => fileInputRef.current?.click()}
          />

          <ActionButton
            icon={<PrinterIcon />}
            label="Print"
            onClick={onPrint}
          />

          <ActionButton
            icon={<RotateCcwIcon />}
            label="Reset"
            onClick={onReset}
          />

          <div className="mx-1 hidden h-8 w-px bg-border sm:block" />

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

          <div className="mx-1 hidden h-8 w-px bg-border sm:block" />

          <ActionButton
            icon={<Undo2Icon />}
            label="Undo"
            onClick={undo}
            disabled={!canUndo}
          />
          <ActionButton
            icon={<Redo2Icon />}
            label="Redo"
            onClick={redo}
            disabled={!canRedo}
          />
        </div>

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

      <aside className="flex flex-col gap-1 self-start rounded-2xl border bg-card p-1.5 shadow-card sm:flex-row sm:items-center sm:gap-1 sm:rounded-3xl sm:p-2">
        <a
          href="https://docs.google.com/forms/d/e/1FAIpQLSfEMCU4OCItlK6DGgIXTovH7_sPSW6mZtMaPGf1OCUQW_43kg/viewform"
          target="_blank"
          rel="noopener noreferrer"
          title="Give Feedback"
          className="flex h-auto flex-col items-center gap-1 rounded-2xl border border-transparent px-3 py-2 text-xs text-foreground transition-colors hover:bg-muted/60"
        >
          <FileTextIcon className="size-4" />
          <span className="text-[10px] leading-none font-medium">Feedback</span>
        </a>
        <a
          href="https://github.com/monashcoding/monmap"
          target="_blank"
          rel="noopener noreferrer"
          title="Contribute on GitHub"
          className="flex h-auto flex-col items-center gap-1 rounded-2xl border border-transparent px-3 py-2 text-xs text-foreground transition-colors hover:bg-muted/60"
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
            className="size-4"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11.04 11.04 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.12 3.04.73.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.4-5.26 5.68.41.36.78 1.06.78 2.14 0 1.54-.01 2.78-.01 3.16 0 .31.21.68.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"
            />
          </svg>
          <span className="text-[10px] leading-none font-medium">
            Contribute!
          </span>
        </a>
      </aside>
    </div>
  )
}

function ActionButton({
  icon,
  label,
  tone,
  onClick,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  tone?: "good" | "bad" | "active"
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      className="flex h-auto flex-col items-center gap-1 rounded-2xl px-3 py-2 text-xs"
    >
      <span
        className={
          tone === "good"
            ? "text-success"
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
