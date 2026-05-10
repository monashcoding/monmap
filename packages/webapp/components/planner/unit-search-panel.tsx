"use client"

import {
  FilterIcon,
  ListOrderedIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { searchUnitsAction } from "@/app/actions"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { PERIOD_KIND_LABEL } from "@/lib/planner/teaching-period"
import {
  slotCapacity,
  slotUsedWeight,
  type PlannerUnit,
} from "@/lib/planner/types"
import { cn } from "@/lib/utils"

import { usePlanner } from "./planner-context"

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

const LEVELS = ["1", "2", "3", "4", "5"] as const
type Level = (typeof LEVELS)[number]

function levelFromCode(code: string): string {
  return code.replace(/\D/g, "").charAt(0) ?? ""
}

export function UnitSearchPanel() {
  const { state, course, units, availableYears, mergeUnits, plannedCodes } =
    usePlanner()

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PlannerUnit[]>([])
  const [loading, setLoading] = useState(false)
  const [levelFilter, setLevelFilter] = useState<Level | null>(null)

  const debounced = useDebounced(query, 180)

  const handbookYear = useMemo(() => {
    const target = state.courseYear
    if (availableYears.includes(target)) return target
    return [...availableYears].sort().at(-1) ?? state.courseYear
  }, [state.courseYear, availableYears])

  const suggestions = useMemo<PlannerUnit[]>(() => {
    if (!course) return []
    const placed = new Set<string>()
    for (const y of state.years)
      for (const s of y.slots) for (const c of s.unitCodes) placed.add(c)
    const seen = new Set<string>()
    const out: PlannerUnit[] = []
    for (const aos of course.areasOfStudy) {
      for (const u of aos.units) {
        if (placed.has(u.code) || seen.has(u.code)) continue
        seen.add(u.code)
        const full = units.get(u.code)
        if (full) out.push(full)
        if (out.length >= 16) break
      }
      if (out.length >= 16) break
    }
    return out
  }, [course, state.years, units])

  useEffect(() => {
    let cancelled = false
    if (!debounced.trim()) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    searchUnitsAction(debounced, handbookYear)
      .then((list) => {
        if (cancelled) return
        setResults(list)
        setLoading(false)
        mergeUnits(list)
      })
      .catch(() => {
        if (cancelled) return
        setResults([])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debounced, mergeUnits, handbookYear])

  const hasQuery = !!debounced.trim()
  const baseItems = hasQuery ? results : suggestions
  const items = levelFilter
    ? baseItems.filter((u) => levelFromCode(u.code) === levelFilter)
    : baseItems

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* Search bar */}
      <div className="flex items-center gap-2 rounded-2xl border bg-muted/30 px-3 py-2">
        <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          placeholder="Search units…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        ) : null}
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="h-6 gap-1 rounded-xl px-2 text-[10px]"
        >
          <FilterIcon className="size-2.5" />
          Filters
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-6 gap-1 rounded-xl px-2 text-[10px]"
        >
          <ListOrderedIcon className="size-2.5" />
          Sort by
        </Button>
        <div className="ml-auto flex items-center gap-1">
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLevelFilter(levelFilter === l ? null : l)}
              className={cn(
                "rounded-lg px-1.5 py-0.5 text-[9px] font-medium transition-colors",
                levelFilter === l
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              L{l}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {hasQuery ? (
        <div className="flex flex-col gap-0.5">
          {loading ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Searching…
            </p>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No matches for &ldquo;{debounced}&rdquo;
            </p>
          ) : (
            items.map((u) => (
              <UnitSearchRow
                key={u.code}
                unit={u}
                placed={plannedCodes.has(u.code)}
              />
            ))
          )}
        </div>
      ) : suggestions.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <p className="px-1 text-[10px] tracking-wide text-muted-foreground uppercase">
            Suggested from your course
          </p>
          {items.map((u) => (
            <UnitSearchRow
              key={u.code}
              unit={u}
              placed={plannedCodes.has(u.code)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function UnitSearchRow({
  unit,
  placed,
}: {
  unit: PlannerUnit
  placed: boolean
}) {
  const { state, units: unitMap, addUnit } = usePlanner()
  const [open, setOpen] = useState(false)
  const startYear = Number(state.courseYear) || new Date().getFullYear()

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl px-2 py-1.5",
        placed ? "opacity-50" : "hover:bg-muted/50"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold tabular-nums">
            {unit.code}
          </span>
          <span className="text-[9px] text-muted-foreground">
            {unit.creditPoints}cp
          </span>
        </div>
        <p className="truncate text-[11px] text-muted-foreground">
          {unit.title}
        </p>
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              size="sm"
              variant="ghost"
              disabled={placed}
              aria-label={`Add ${unit.code}`}
              className="size-6 shrink-0 rounded-lg p-0"
            >
              <PlusIcon className="size-3.5" />
            </Button>
          }
        />
        <PopoverContent align="end" sideOffset={4} className="w-52 p-1.5">
          <p className="px-2 py-1 text-[10px] text-muted-foreground">Add to…</p>
          {state.years.map((year, yi) =>
            year.slots.map((slot, si) => {
              const cap = slotCapacity(slot)
              const used = slotUsedWeight(slot, unitMap)
              const full = used >= cap
              const label =
                slot.label ??
                `${PERIOD_KIND_LABEL[slot.kind]}, ${startYear + yi}`
              return (
                <button
                  key={`${yi}:${si}`}
                  type="button"
                  disabled={full}
                  onClick={() => {
                    addUnit(yi, si, unit.code)
                    setOpen(false)
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors",
                    full ? "cursor-not-allowed opacity-40" : "hover:bg-muted"
                  )}
                >
                  <span className="truncate">{label}</span>
                  <span className="ml-2 shrink-0 text-[10px] text-muted-foreground tabular-nums">
                    {used}/{cap}
                  </span>
                </button>
              )
            })
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
