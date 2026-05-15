"use client"

import { Trash2Icon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  listMyGradesWithTitlesAction,
  setMyGradeAction,
  type UserGradeWithTitle,
} from "@/app/actions"
import { GRADE_STYLES, markToGrade } from "@/lib/planner/grades"
import { cn } from "@/lib/utils"

const SAVE_DEBOUNCE_MS = 600

/**
 * Editable list of every grade the student has recorded. Each row is
 * a comfy-height card with the unit code, title and mark editor — works
 * the same way on phone and desktop without forcing a table layout to
 * shrink awkwardly.
 */
export function MyGradesDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [rows, setRows] = useState<UserGradeWithTitle[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  )

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void listMyGradesWithTitlesAction().then((data) => {
      if (cancelled) return
      setRows(data)
      setHasLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    const timers = saveTimers.current
    return () => {
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
    }
  }, [])

  const scheduleSave = (code: string, mark: number | null) => {
    const timers = saveTimers.current
    const existing = timers.get(code)
    if (existing) clearTimeout(existing)
    timers.set(
      code,
      setTimeout(() => {
        timers.delete(code)
        void setMyGradeAction(code, mark)
      }, SAVE_DEBOUNCE_MS)
    )
  }

  const updateMark = (code: string, value: string) => {
    const next =
      value === ""
        ? null
        : Math.max(0, Math.min(100, Math.round(Number(value))))
    setRows((prev) =>
      prev.map((r) =>
        r.unitCode === code ? { ...r, mark: next ?? r.mark } : r
      )
    )
    scheduleSave(code, next)
  }

  const removeRow = (code: string) => {
    const timers = saveTimers.current
    const existing = timers.get(code)
    if (existing) {
      clearTimeout(existing)
      timers.delete(code)
    }
    setRows((prev) => prev.filter((r) => r.unitCode !== code))
    void setMyGradeAction(code, null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b p-4 sm:p-6">
          <DialogTitle>My grades</DialogTitle>
          <DialogDescription>
            Marks you&apos;ve recorded for units. Edits save automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70svh] overflow-y-auto p-3 sm:p-4">
          {!hasLoaded ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No grades yet. Add marks from the planner&apos;s WAM mode.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((row) => (
                <GradeRow
                  key={row.unitCode}
                  row={row}
                  onMarkChange={(v) => updateMark(row.unitCode, v)}
                  onRemove={() => removeRow(row.unitCode)}
                />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function GradeRow({
  row,
  onMarkChange,
  onRemove,
}: {
  row: UserGradeWithTitle
  onMarkChange: (value: string) => void
  onRemove: () => void
}) {
  const letter = markToGrade(row.mark)
  const style = GRADE_STYLES[letter]
  return (
    <li className="flex items-center gap-3 rounded-xl border bg-background px-3 py-2.5 shadow-sm">
      <span
        className={cn(
          "shrink-0 rounded px-1.5 py-1 text-[11px] font-bold tabular-nums",
          style.bg,
          style.text
        )}
      >
        {letter}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold tabular-nums">
          {row.unitCode}
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          {row.unitTitle ?? <span className="italic">Unknown unit</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Input
          type="number"
          min={0}
          max={100}
          defaultValue={row.mark}
          onChange={(e) => onMarkChange(e.target.value)}
          aria-label={`Mark for ${row.unitCode}`}
          className="h-9 w-16 px-2 text-right text-sm tabular-nums"
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete grade for ${row.unitCode}`}
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
    </li>
  )
}
