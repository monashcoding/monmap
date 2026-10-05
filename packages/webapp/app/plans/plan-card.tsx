"use client"

import { useState, useSyncExternalStore, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import posthog from "posthog-js"
import {
  BookOpenIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  PrinterIcon,
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
  deleteMyPlanAction,
  duplicateMyPlanAction,
  hydrateUnitsAction,
  listMyGradesAction,
  renameMyPlanAction,
} from "@/app/actions"

import type { PlanPageData } from "./page"
import { buildCsv, downloadBlob, planFileName } from "@/lib/planner/plan-export"
import { PlanMap } from "@/components/planner/plan-map"
import type { PlannerState } from "@/lib/planner/types"

import { PlanPreview } from "./plan-preview"

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

  function handleDelete() {
    posthog.capture("plan_deleted", {
      course_code: course?.code,
      total_credit_points: totalCreditPoints,
      completion_pct: pct,
    })
    startTransition(async () => {
      await deleteMyPlanAction(plan.id)
      router.refresh()
    })
  }

  function handleDuplicate() {
    posthog.capture("plan_duplicated", {
      course_code: course?.code,
      total_credit_points: totalCreditPoints,
    })
    startTransition(async () => {
      await duplicateMyPlanAction(plan.id)
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
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="overflow-hidden rounded-panel border bg-card shadow-card">
        {/* Body: stacked on mobile, side-by-side on md+, with the
            prerequisite map as a third column on wide screens. */}
        <div className="grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] md:divide-x xl:grid-cols-[260px_auto_minmax(0,1fr)]">
          <div className="flex flex-col gap-3 p-4 sm:p-5">
            <div>
              {editingName ? (
                <input
                  aria-label="Plan name"
                  className="-mx-2 -my-1 w-[calc(100%+1rem)] rounded-control bg-card px-2 py-1 text-base leading-tight font-bold ring-1 ring-ring outline-none"
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
                // Same rename affordance as the planner's plan title: a
                // grey wash on hover, no colour change.
                <h2 className="text-base leading-tight font-bold">
                  <button
                    type="button"
                    title={`Rename "${plan.name}"`}
                    onClick={startNameEdit}
                    className="-mx-2 -my-1 rounded-control px-2 py-1 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {plan.name}
                  </button>
                </h2>
              )}
              {course ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {course.code} - {course.title}
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

          {/* Preview hidden on small mobile (saves vertical space) and
              reappears as a side panel from md upward. */}
          <div className="hidden items-start border-t p-4 sm:flex md:border-t-0">
            <PlanPreview state={plan.state} />
          </div>

          <PlanMapThumbnail state={plan.state} />
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/10 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            {handbookUrl ? (
              <a
                href={handbookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({
                  variant: "ghost",
                  size: "sm",
                  className: "h-8 gap-1.5 text-[11px]",
                })}
              >
                <BookOpenIcon className="size-3.5" />
                Handbook
              </a>
            ) : null}

            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-[11px]"
              disabled={isPending}
              onClick={() => {
                posthog.capture("plan_exported", {
                  format: "csv",
                  course_code: course?.code,
                })
                // This page only has the plan's codes, so fetch titles,
                // credit points and marks for the export.
                startTransition(async () => {
                  const codes = [
                    ...new Set([
                      ...plan.state.years.flatMap((y) =>
                        y.slots.flatMap((s) => s.unitCodes)
                      ),
                      ...(plan.state.credit ?? []).flatMap((c) =>
                        c.code ? [c.code] : []
                      ),
                    ]),
                  ]
                  const [hydrated, grades] = await Promise.all([
                    hydrateUnitsAction(codes, plan.state.courseYear),
                    listMyGradesAction(),
                  ])
                  downloadBlob(
                    buildCsv(plan.state, {
                      units: new Map(Object.entries(hydrated.units)),
                      grades: new Map(Object.entries(grades)),
                    }),
                    planFileName(plan.name, "csv"),
                    "text/csv"
                  )
                })
              }}
            >
              <DownloadIcon className="size-3.5" />
              Export to CSV
            </Button>
            {/* The print layout needs the planner's unit data, so Print
                opens the plan and prints once it has loaded. */}
            <Link
              href={`/?plan=${plan.id}&print=1`}
              className={buttonVariants({
                variant: "ghost",
                size: "sm",
                className: "h-8 gap-1.5 text-[11px]",
              })}
            >
              <PrinterIcon className="size-3.5" />
              Print
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-[11px]"
              disabled={isPending}
              onClick={handleDuplicate}
            >
              <CopyIcon className="size-3.5" />
              <span className="hidden sm:inline">Duplicate</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-[11px] text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
              disabled={isPending}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2Icon className="size-3.5" />
              <span className="hidden sm:inline">Delete</span>
            </Button>
            <Link
              href={`/?plan=${plan.id}`}
              className="inline-flex items-center gap-1.5 rounded-control bg-primary px-3 py-2 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
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

/**
 * A zoomed-out prerequisite map of the plan (pinch to zoom, drag to
 * pan), filling the card's third column on wide screens. It mounts
 * only at that width, so narrower screens don't fetch the graph.
 */
function PlanMapThumbnail({ state }: { state: PlannerState }) {
  const wide = useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia("(min-width: 1280px)")
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.matchMedia("(min-width: 1280px)").matches,
    () => false
  )
  if (!wide) return null
  return (
    <div className="relative min-h-48">
      <PlanMap
        state={state}
        variant="thumbnail"
        className="absolute inset-0 h-full min-h-0 rounded-none border-0 shadow-none"
      />
    </div>
  )
}
