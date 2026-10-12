"use client"

import { ArrowLeftIcon, PlusIcon, SearchIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { fetchUnitSearch } from "@/lib/api/client"
import type { PlannerUnit } from "@/lib/planner/types"

import { OwnReviewEditor } from "./own-review-editor"

/**
 * Review another unit without leaving My reviews: search for the unit,
 * then fill in the same form as on its page. Picking a unit the student
 * has already reviewed edits that review.
 */
export function QuickReviewDialog({
  year,
  reviewedCodes,
}: {
  /** The handbook year to search. */
  year: string
  reviewedCodes: readonly string[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [picked, setPicked] = useState<PlannerUnit | null>(null)
  const [found, setFound] = useState<{ q: string; units: PlannerUnit[] }>({
    q: "",
    units: [],
  })
  const q = useDebouncedValue(query.trim(), 200)

  useEffect(() => {
    if (!q) return
    const controller = new AbortController()
    fetchUnitSearch(q, year, controller.signal)
      .then((units) => {
        if (!controller.signal.aborted) setFound({ q, units })
      })
      .catch(() => {
        if (!controller.signal.aborted) setFound({ q, units: [] })
      })
    return () => controller.abort()
  }, [q, year])

  const reviewed = new Set(reviewedCodes)
  const results = q && found.q === q ? found.units : []
  const loading = q !== "" && found.q !== q

  const reset = () => {
    setQuery("")
    setPicked(null)
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden />
        Review a unit
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) reset()
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {picked ? `${picked.code} ${picked.title}` : "Review a unit"}
            </DialogTitle>
          </DialogHeader>
          {picked ? (
            <div className="flex flex-col gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => setPicked(null)}
              >
                <ArrowLeftIcon aria-hidden />
                Pick another unit
              </Button>
              <OwnReviewEditor
                kind="unit"
                code={picked.code}
                onCancel={() => setPicked(null)}
                onSaved={() => {
                  setOpen(false)
                  reset()
                  router.refresh()
                }}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="relative">
                <SearchIcon
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Unit code or title, e.g. FIT1045"
                  className="pl-9"
                  aria-label="Search units"
                />
              </div>
              {loading ? (
                <p className="px-1 text-sm text-muted-foreground">Searching…</p>
              ) : q && results.length === 0 ? (
                <p className="px-1 text-sm text-muted-foreground">
                  No units match “{q}”.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {results.map((u) => {
                    const done = reviewed.has(u.code)
                    return (
                      <li key={u.code}>
                        <button
                          type="button"
                          onClick={() => setPicked(u)}
                          className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-muted"
                        >
                          <span className="w-20 shrink-0 text-sm font-semibold tabular-nums">
                            {u.code}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm">
                            {u.title}
                          </span>
                          {done ? (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              Reviewed
                            </span>
                          ) : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** The student's review of one unit, in a dialog. */
export function UnitReviewDialog({
  code,
  title,
  open,
  onOpenChange,
}: {
  code: string
  title: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title ? `${code} ${title}` : code}</DialogTitle>
        </DialogHeader>
        {open ? (
          <OwnReviewEditor
            kind="unit"
            code={code}
            onCancel={() => onOpenChange(false)}
            onSaved={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
