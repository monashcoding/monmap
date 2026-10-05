"use client"

import {
  BadgeCheckIcon,
  CircleAlertIcon,
  DownloadIcon,
  EllipsisIcon,
  GraduationCapIcon,
  NotebookPenIcon,
  PencilIcon,
  PlusIcon,
  PrinterIcon,
  Redo2Icon,
  RotateCcwIcon,
  Undo2Icon,
  UploadIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { PlannerState } from "@/lib/planner/types"

import { CreditDialog } from "./credit-dialog"
import { usePlanner } from "./planner-context"
import { useWam } from "./wam-context"

/**
 * Plan header above the grid: the plan's name (click to rename) and
 * its validation status on the left; undo/redo, the Results toggle,
 * Add year and a More menu on the right. State-only
 * operations (no server round-trip).
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
  const { showResults, toggleShowResults } = useWam()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [creditOpen, setCreditOpen] = useState(false)
  const creditCount = state.credit?.length ?? 0

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

  const planTitle =
    currentUser && activePlan ? activePlan.name : "Your course map"

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 print:hidden">
      <div className="flex min-w-0 items-center gap-3">
        {currentUser && activePlan && editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitNameEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitNameEdit()
              if (e.key === "Escape") cancelNameEdit()
            }}
            aria-label="Plan name"
            className="w-full max-w-[320px] min-w-0 rounded-control bg-card px-2 py-1 text-lg font-semibold ring-1 ring-ring outline-none"
          />
        ) : currentUser && activePlan ? (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            title={`Rename "${activePlan.name}"`}
            className="group/name flex min-w-0 items-center gap-1.5 rounded-control px-2 py-1 text-left text-lg font-semibold outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="truncate">{planTitle}</span>
            <PencilIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/name:opacity-100 group-focus-visible/name:opacity-100" />
          </button>
        ) : (
          <h2 className="truncate px-2 py-1 text-lg font-semibold">
            {planTitle}
          </h2>
        )}

        <Button
          variant="outline"
          size="sm"
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
          title={
            errorCount === 0
              ? "Every unit meets its prereqs and is offered in its slot"
              : "Highlight the units with problems"
          }
          className="shrink-0"
        >
          {errorCount === 0 ? (
            <BadgeCheckIcon className="text-success" />
          ) : (
            <CircleAlertIcon className="text-destructive" />
          )}
          {errorCount === 0
            ? "Valid"
            : `${errorCount} issue${errorCount === 1 ? "" : "s"}`}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={undo}
          disabled={!canUndo}
          aria-label="Undo"
          title="Undo"
        >
          <Undo2Icon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={redo}
          disabled={!canRedo}
          aria-label="Redo"
          title="Redo"
        >
          <Redo2Icon />
        </Button>

        <div aria-hidden className="mx-1 h-5 w-px bg-border" />

        <ToggleButton
          icon={<NotebookPenIcon />}
          label="Results"
          pressed={showResults}
          onClick={toggleShowResults}
        />

        <div aria-hidden className="mx-1 h-5 w-px bg-border" />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => dispatch({ type: "add_year" })}
        >
          <PlusIcon />
          Add year
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="More plan actions"
                title="More"
              />
            }
          >
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => setCreditOpen(true)}>
              <GraduationCapIcon />
              Credit
              {creditCount > 0 ? (
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {creditCount}
                </span>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExport}>
              <UploadIcon />
              Export
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
              <DownloadIcon />
              Import
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onPrint}>
              <PrinterIcon />
              Print
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onReset}>
              <RotateCcwIcon />
              Reset plan
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
      <CreditDialog open={creditOpen} onOpenChangeAction={setCreditOpen} />
    </div>
  )
}

function ToggleButton({
  icon,
  label,
  pressed,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  pressed: boolean
  onClick: () => void
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={pressed}
      onClick={onClick}
      className={
        pressed
          ? "bg-emphasis-soft text-emphasis hover:bg-emphasis-soft hover:text-emphasis"
          : "text-muted-foreground"
      }
    >
      {icon}
      {label}
    </Button>
  )
}
