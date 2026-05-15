"use client"

import { ChevronDownIcon, SearchIcon, XIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { searchUnitsAction } from "@/app/actions"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { PlannerUnit } from "@/lib/planner/types"
import type { TreeDirection } from "@/lib/tree/types"
import { cn } from "@/lib/utils"

import { ControlSection } from "./section"
import { YearDepthRow } from "./year-depth-row"

const DIRECTIONS: Array<{ value: TreeDirection; label: string }> = [
  { value: "upstream", label: "What it needs" },
  { value: "downstream", label: "What it unlocks" },
  { value: "both", label: "Both" },
]

export function UnitBlock({
  unitCode,
  year,
  depth,
  direction,
  availableYears,
  onUnitChange,
  onDirectionChange,
  onYearChange,
  onDepthChange,
}: {
  unitCode: string | null
  year: string
  depth: number
  direction: TreeDirection
  availableYears: string[]
  onUnitChange: (code: string) => void
  onDirectionChange: (d: TreeDirection) => void
  onYearChange: (y: string) => void
  onDepthChange: (d: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [results, setResults] = useState<PlannerUnit[]>([])
  const qReady = q.trim().length >= 2
  useEffect(() => {
    if (!qReady) return
    let cancelled = false
    void searchUnitsAction(q, year).then((r) => {
      if (!cancelled) setResults(r)
    })
    return () => {
      cancelled = true
    }
  }, [q, year, qReady])
  const visibleResults = qReady ? results : []

  return (
    <ControlSection title="Unit">
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-xl border bg-background py-2 pr-9 pl-3 text-left hover:border-muted-foreground/40"
                >
                  <span className="inline-flex items-center gap-2 text-xs">
                    <SearchIcon className="size-3.5 text-muted-foreground" />
                    {unitCode ? (
                      <span className="font-bold tabular-nums">{unitCode}</span>
                    ) : (
                      <span className="text-muted-foreground">
                        Search unit code or title…
                      </span>
                    )}
                  </span>
                  {!unitCode ? (
                    <ChevronDownIcon className="size-3.5 text-muted-foreground" />
                  ) : null}
                </button>
              }
            />
            <PopoverContent
              className="w-[min(360px,calc(100vw-2rem))] p-2"
              align="start"
            >
              <input
                autoFocus
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="e.g. FIT2004 or algorithms"
                className="mb-1.5 w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs"
              />
              <ul className="max-h-60 overflow-y-auto">
                {visibleResults.length === 0 && qReady ? (
                  <li className="px-2 py-1.5 text-xs text-muted-foreground italic">
                    No matches.
                  </li>
                ) : null}
                {visibleResults.map((u) => (
                  <li key={u.code}>
                    <button
                      type="button"
                      onClick={() => {
                        onUnitChange(u.code)
                        setOpen(false)
                        setQ("")
                      }}
                      className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                    >
                      <span className="text-[11px] font-bold tabular-nums">
                        {u.code}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {u.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
          {unitCode ? (
            <button
              type="button"
              aria-label="Clear unit"
              onClick={() => onUnitChange("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <XIcon className="size-3" />
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-1">
          {DIRECTIONS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => onDirectionChange(d.value)}
              className={cn(
                "rounded-lg border px-2 py-1.5 text-[10px] leading-tight font-semibold transition-colors",
                direction === d.value
                  ? "border-[var(--monash-purple)] bg-[var(--monash-purple-soft)] text-[var(--monash-purple-deep)]"
                  : "border-border bg-background text-muted-foreground hover:border-muted-foreground/40"
              )}
            >
              {d.label}
            </button>
          ))}
        </div>

        <YearDepthRow
          year={year}
          depth={depth}
          availableYears={availableYears}
          onYearChange={onYearChange}
          onDepthChange={onDepthChange}
        />
      </div>
    </ControlSection>
  )
}
