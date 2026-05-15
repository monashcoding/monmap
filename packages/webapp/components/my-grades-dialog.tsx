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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  listMyGradesWithTitlesAction,
  setMyGradeAction,
  type UserGradeWithTitle,
} from "@/app/actions"
import { GRADE_STYLES, markToGrade } from "@/lib/planner/grades"
import { cn } from "@/lib/utils"

const SAVE_DEBOUNCE_MS = 600

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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>My grades</DialogTitle>
          <DialogDescription>
            Marks you&apos;ve recorded for units. Edits save automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-2 max-h-[60vh] overflow-y-auto px-2">
          {!hasLoaded ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No grades yet. Add marks from the planner&apos;s WAM mode.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Unit</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-32 text-right">Mark</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const letter = markToGrade(row.mark)
                  const style = GRADE_STYLES[letter]
                  return (
                    <TableRow key={row.unitCode}>
                      <TableCell className="font-bold tabular-nums">
                        {row.unitCode}
                      </TableCell>
                      <TableCell className="max-w-0 truncate text-foreground/90">
                        {row.unitTitle ?? (
                          <span className="text-muted-foreground italic">
                            Unknown unit
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                              style.bg,
                              style.text
                            )}
                          >
                            {letter}
                          </span>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            defaultValue={row.mark}
                            onChange={(e) =>
                              updateMark(row.unitCode, e.target.value)
                            }
                            className="h-8 w-16 px-2 text-right text-sm tabular-nums"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete grade for ${row.unitCode}`}
                          onClick={() => removeRow(row.unitCode)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
