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

import type { PlanPageData } from "./page"
import { allCodesFlat, buildCsv, downloadBlob, planSlug } from "./plan-export"
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

  const slug = planSlug(plan.name)

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
        {/* Body: stacked on mobile, side-by-side on md+. */}
        <div className="grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] md:divide-x">
          <div className="flex flex-col gap-3 p-4 sm:p-5">
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

          {/* Preview hidden on small mobile (saves vertical space) and
              reappears as a side panel from md upward. */}
          <div className="hidden items-start border-t p-4 sm:flex md:border-t-0">
            <PlanPreview state={plan.state} />
          </div>
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

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-[11px]"
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
              className="h-8 gap-1.5 text-[11px] text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
              disabled={isPending}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2Icon className="size-3.5" />
              <span className="hidden sm:inline">Delete</span>
            </Button>
            <Link
              href={`/?plan=${plan.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
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
