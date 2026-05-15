"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  BookOpenIcon,
  ChevronRightIcon,
  ClipboardCopyIcon,
  DownloadIcon,
  Trash2Icon,
} from "lucide-react"

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
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { deleteMyPlanAction, renameMyPlanAction } from "@/app/actions"
import { facultyStyle } from "@/lib/planner/faculty-color"
import { DEFAULT_SLOT_CAPACITY, type PlannerState } from "@/lib/planner/types"
import { PERIOD_KIND_LABEL } from "@/lib/planner/teaching-period"
import { cn } from "@/lib/utils"

import type { PlanPageData } from "./page"

// ── Preview grid ──────────────────────────────────────────────────

function PlanPreview({ state }: { state: PlannerState }) {
  const startYear = Number(state.courseYear) || new Date().getFullYear()

  const maxCols = state.years.reduce(
    (max, year) =>
      year.slots.reduce(
        (m, slot) =>
          Math.max(
            m,
            slot.capacity ?? DEFAULT_SLOT_CAPACITY,
            slot.unitCodes.length
          ),
        max
      ),
    DEFAULT_SLOT_CAPACITY
  )

  const CELL_W = 72

  return (
    <div className="max-h-[220px] overflow-x-auto overflow-y-auto pr-1">
      <div className="flex min-w-max flex-col gap-1">
        {state.years.map((year, yi) =>
          year.slots.map((slot, si) => {
            const label =
              slot.label ?? `${PERIOD_KIND_LABEL[slot.kind]}, ${startYear + yi}`
            return (
              <div key={`${yi}:${si}`} className="flex items-center gap-1.5">
                <div
                  className="shrink-0 text-right text-[10px] leading-tight text-muted-foreground/70"
                  style={{ width: 112 }}
                >
                  {label}
                </div>
                <div className="flex gap-1">
                  {Array.from({ length: maxCols }, (_, i) => {
                    const code = slot.unitCodes[i]
                    if (!code) {
                      return (
                        <div
                          key={i}
                          className="shrink-0 rounded border border-dashed border-border bg-muted/40"
                          style={{ width: CELL_W, height: 26 }}
                        />
                      )
                    }
                    const fs = facultyStyle(code)
                    return (
                      <div
                        key={i}
                        className="flex shrink-0 items-center overflow-hidden rounded border border-border/60 bg-background"
                        style={{ width: CELL_W, height: 26 }}
                      >
                        <div
                          className={cn(
                            "w-[3px] shrink-0 self-stretch",
                            fs.railClass
                          )}
                        />
                        <span className="truncate px-1.5 text-[10px] font-semibold tabular-nums">
                          {code}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Export helpers ────────────────────────────────────────────────

function allCodesFlat(state: PlannerState): string[] {
  const seen = new Set<string>()
  for (const year of state.years)
    for (const slot of year.slots)
      for (const code of slot.unitCodes) seen.add(code)
  return [...seen]
}

function buildCsv(state: PlannerState, planName: string): string {
  const startYear = Number(state.courseYear) || new Date().getFullYear()
  const rows: string[][] = [["Plan", "Year", "Semester", "Unit Code"]]
  for (let yi = 0; yi < state.years.length; yi++) {
    const year = state.years[yi]!
    for (const slot of year.slots) {
      const sem = `${PERIOD_KIND_LABEL[slot.kind]}, ${startYear + yi}`
      for (const code of slot.unitCodes) {
        rows.push([planName, String(startYear + yi), sem, code])
      }
    }
  }
  return rows
    .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
    .join("\n")
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Progress bar ──────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  )
}

// ── Plan card ─────────────────────────────────────────────────────

export function PlanCard({ data }: { data: PlanPageData }) {
  const { plan, course, totalCreditPoints } = data
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(plan.name)

  function startNameEdit() {
    setNameDraft(plan.name)
    setEditingName(true)
  }

  function commitNameEdit() {
    const trimmed = nameDraft.trim()
    setEditingName(false)
    if (!trimmed || trimmed === plan.name) return
    startTransition(async () => {
      await renameMyPlanAction(plan.id, trimmed)
      router.refresh()
    })
  }

  function cancelNameEdit() {
    setNameDraft(plan.name)
    setEditingName(false)
  }

  const targetCp = course?.creditPoints ?? 144
  const pct =
    targetCp > 0 ? Math.round((totalCreditPoints / targetCp) * 100) : 0

  const handbookUrl = course
    ? `https://handbook.monash.edu/${course.year}/courses/${course.code}`
    : null

  const slug = plan.name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")

  function handleDelete() {
    startTransition(async () => {
      await deleteMyPlanAction(plan.id)
      router.refresh()
    })
  }

  return (
    <>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{plan.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This plan will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        {/* Main body */}
        <div className="grid grid-cols-[260px_minmax(0,1fr)] divide-x">
          {/* Left: metadata */}
          <div className="flex flex-col gap-3 p-5">
            <div>
              {editingName ? (
                <input
                  className="w-full rounded bg-muted/50 px-1 text-base leading-tight font-bold ring-1 ring-primary outline-none focus:ring-2"
                  value={nameDraft}
                  autoFocus
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={commitNameEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitNameEdit()
                    if (e.key === "Escape") cancelNameEdit()
                  }}
                />
              ) : (
                <h2
                  className="cursor-text text-base leading-tight font-bold hover:text-primary"
                  title="Click to rename"
                  onClick={startNameEdit}
                >
                  {plan.name}
                </h2>
              )}
              {course ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {course.code} — {course.title}
                </p>
              ) : (
                <p className="mt-0.5 text-[11px] text-muted-foreground italic">
                  No course selected
                </p>
              )}
            </div>

            {course?.school ? (
              <div>
                <div className="text-[10px] font-semibold tracking-wide text-muted-foreground/70 uppercase">
                  Managing Faculty
                </div>
                <div className="mt-0.5 text-xs text-foreground/80">
                  {course.school}
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <ProgressBar pct={pct} />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {totalCreditPoints}
                  </span>{" "}
                  / {targetCp} credit points
                </span>
                <span className="tabular-nums">{pct}%</span>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold tracking-wide text-muted-foreground/70 uppercase">
                Last updated
              </div>
              <div className="mt-0.5 text-[11px] text-foreground/80">
                {plan.updatedAt.toLocaleString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
            </div>
          </div>

          {/* Right: preview */}
          <div className="flex items-start p-4">
            <PlanPreview state={plan.state} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t bg-muted/10 px-5 py-3">
          <div className="flex items-center gap-2">
            {handbookUrl ? (
              <a
                href={handbookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({
                  variant: "ghost",
                  size: "sm",
                  className: "h-7 gap-1.5 text-[11px]",
                })}
              >
                <BookOpenIcon className="size-3.5" />
                Handbook
              </a>
            ) : null}

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-[11px]"
                  />
                }
              >
                <DownloadIcon className="size-3.5" />
                Export
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onClick={() => {
                    const codes = allCodesFlat(plan.state).join("\n")
                    void navigator.clipboard.writeText(codes)
                  }}
                >
                  <ClipboardCopyIcon className="size-3.5" />
                  Copy unit codes
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    const csv = buildCsv(plan.state, plan.name)
                    downloadBlob(csv, `${slug}.csv`, "text/csv")
                  }}
                >
                  <DownloadIcon className="size-3.5" />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    const json = JSON.stringify(
                      { name: plan.name, state: plan.state },
                      null,
                      2
                    )
                    downloadBlob(json, `${slug}.json`, "application/json")
                  }}
                >
                  <DownloadIcon className="size-3.5" />
                  Export as JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-[11px] text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
              disabled={isPending}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2Icon className="size-3.5" />
              Delete
            </Button>
            <Link
              href={`/?plan=${plan.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Edit plan
              <ChevronRightIcon className="size-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
