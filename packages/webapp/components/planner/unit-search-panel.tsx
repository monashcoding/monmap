"use client"

import {
  CheckIcon,
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
import {
  PERIOD_KIND_LABEL,
  PERIOD_KIND_SHORT,
} from "@/lib/planner/teaching-period"
import type { PeriodKind } from "@/lib/planner/types"
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

function extractLevelNum(level: string | null): number | null {
  if (!level) return null
  const m = level.match(/\d+/)
  return m ? Number(m[0]) : null
}

function toggle<T>(set: Set<T>, val: T): Set<T> {
  const next = new Set(set)
  if (next.has(val)) next.delete(val)
  else next.add(val)
  return next
}

const LEVEL_OPTIONS = [1, 2, 3, 4]
const CP_OPTIONS = [6, 12, 18, 24]
const PERIOD_OPTIONS: PeriodKind[] = [
  "S1",
  "S2",
  "FULL_YEAR",
  "SUMMER_A",
  "WINTER",
]
const CAMPUS_OPTIONS = ["Clayton", "Caulfield", "Malaysia"]
const MODE_OPTIONS = [
  { code: "ON-CAMPUS", label: "On-campus" },
  { code: "ONLINE", label: "Online" },
]
const SORT_OPTIONS = [
  { key: "relevance", label: "Relevance" },
  { key: "level-asc", label: "Level (1→4)" },
  { key: "level-desc", label: "Level (4→1)" },
  { key: "credit", label: "Credit points" },
  { key: "code", label: "Unit code (A→Z)" },
] as const
type SortKey = (typeof SORT_OPTIONS)[number]["key"]

const CHIP_BASE =
  "flex items-center justify-center rounded-lg text-xs font-medium transition-all border"
const CHIP_ACTIVE =
  "border-primary bg-primary text-primary-foreground shadow-sm"
const CHIP_IDLE =
  "border-transparent bg-muted text-foreground hover:border-primary/60 hover:bg-primary/40"

export function UnitSearchPanel() {
  const {
    state,
    course,
    units,
    offerings,
    availableYears,
    mergeUnits,
    plannedCodes,
  } = usePlanner()

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PlannerUnit[]>([])
  const [loading, setLoading] = useState(false)

  const [levelFilter, setLevelFilter] = useState<Set<number>>(new Set())
  const [cpFilter, setCpFilter] = useState<Set<number>>(new Set())
  const [periodFilter, setPeriodFilter] = useState<Set<PeriodKind>>(new Set())
  const [campusFilter, setCampusFilter] = useState<Set<string>>(new Set())
  const [modeFilter, setModeFilter] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy] = useState<SortKey>("relevance")
  const [filterOpen, setFilterOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)

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
        if (out.length >= 8) break
      }
      if (out.length >= 8) break
    }
    return out
  }, [course, state.years, units])

  useEffect(() => {
    let cancelled = false
    if (!debounced.trim()) return
    const t = setTimeout(() => setLoading(true), 0)
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
      clearTimeout(t)
    }
  }, [debounced, mergeUnits, handbookYear])

  const hasQuery = !!debounced.trim()
  const rawItems = hasQuery ? results : suggestions

  const hasActiveFilters =
    levelFilter.size > 0 ||
    cpFilter.size > 0 ||
    periodFilter.size > 0 ||
    campusFilter.size > 0 ||
    modeFilter.size > 0

  const activeFilterCount =
    levelFilter.size +
    cpFilter.size +
    periodFilter.size +
    campusFilter.size +
    modeFilter.size

  const items = useMemo(() => {
    let list = [...rawItems]

    if (levelFilter.size > 0) {
      list = list.filter((u) => {
        const n = extractLevelNum(u.level)
        return n !== null && levelFilter.has(n)
      })
    }

    if (cpFilter.size > 0) {
      list = list.filter((u) => cpFilter.has(u.creditPoints))
    }

    if (periodFilter.size > 0 || campusFilter.size > 0 || modeFilter.size > 0) {
      list = list.filter((u) => {
        const offs = offerings.get(u.code)
        if (!offs || offs.length === 0) return true
        return offs.some((o) => {
          if (periodFilter.size > 0 && !periodFilter.has(o.periodKind))
            return false
          if (campusFilter.size > 0 && !campusFilter.has(o.location ?? ""))
            return false
          if (
            modeFilter.size > 0 &&
            !modeFilter.has(o.attendanceModeCode ?? "")
          )
            return false
          return true
        })
      })
    }

    if (sortBy === "level-asc") {
      list.sort((a, b) => {
        const la = extractLevelNum(a.level) ?? 99
        const lb = extractLevelNum(b.level) ?? 99
        return la - lb
      })
    } else if (sortBy === "level-desc") {
      list.sort((a, b) => {
        const la = extractLevelNum(a.level) ?? -1
        const lb = extractLevelNum(b.level) ?? -1
        return lb - la
      })
    } else if (sortBy === "credit") {
      list.sort((a, b) => a.creditPoints - b.creditPoints)
    } else if (sortBy === "code") {
      list.sort((a, b) => a.code.localeCompare(b.code))
    }

    return list
  }, [
    rawItems,
    levelFilter,
    cpFilter,
    periodFilter,
    campusFilter,
    modeFilter,
    sortBy,
    offerings,
  ])

  function clearFilters() {
    setLevelFilter(new Set())
    setCpFilter(new Set())
    setPeriodFilter(new Set())
    setCampusFilter(new Set())
    setModeFilter(new Set())
  }

  return (
    <div className="flex flex-col gap-2.5 p-3">
      {/* Search bar */}
      <div className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2">
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

      {/* Filter / Sort row */}
      <div className="flex items-center gap-2">
        {/* Filters popover */}
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger
            render={
              <Button
                size="sm"
                variant={hasActiveFilters ? "default" : "outline"}
                className="h-7 gap-1.5 rounded-lg px-2.5 text-xs"
              >
                <FilterIcon className="size-3" />
                Filters
                {hasActiveFilters && (
                  <span className="flex size-4 items-center justify-center rounded-full bg-primary-foreground/20 text-[10px] leading-none tabular-nums">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            }
          />
          <PopoverContent align="start" sideOffset={6} className="w-64 p-0">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-2">
              <p className="text-sm font-semibold">Filters</p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Sections */}
            <div className="flex flex-col gap-4 px-4 pt-2.5 pb-4">
              {/* Level */}
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Level
                </p>
                <div className="flex gap-1.5">
                  {LEVEL_OPTIONS.map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setLevelFilter((s) => toggle(s, lvl))}
                      className={cn(
                        CHIP_BASE,
                        "h-8 w-10",
                        levelFilter.has(lvl) ? CHIP_ACTIVE : CHIP_IDLE
                      )}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Credit points */}
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Credit points
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {CP_OPTIONS.map((cp) => (
                    <button
                      key={cp}
                      type="button"
                      onClick={() => setCpFilter((s) => toggle(s, cp))}
                      className={cn(
                        CHIP_BASE,
                        "h-8 px-3",
                        cpFilter.has(cp) ? CHIP_ACTIVE : CHIP_IDLE
                      )}
                    >
                      {cp}cp
                    </button>
                  ))}
                </div>
              </div>

              {/* Teaching period */}
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Teaching period
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PERIOD_OPTIONS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPeriodFilter((s) => toggle(s, p))}
                      className={cn(
                        CHIP_BASE,
                        "h-8 px-3",
                        periodFilter.has(p) ? CHIP_ACTIVE : CHIP_IDLE
                      )}
                    >
                      {PERIOD_KIND_SHORT[p]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Campus */}
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Campus
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {CAMPUS_OPTIONS.map((campus) => (
                    <button
                      key={campus}
                      type="button"
                      onClick={() => setCampusFilter((s) => toggle(s, campus))}
                      className={cn(
                        CHIP_BASE,
                        "h-8 px-3",
                        campusFilter.has(campus) ? CHIP_ACTIVE : CHIP_IDLE
                      )}
                    >
                      {campus}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode */}
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Mode
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {MODE_OPTIONS.map(({ code, label }) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setModeFilter((s) => toggle(s, code))}
                      className={cn(
                        CHIP_BASE,
                        "h-8 px-3",
                        modeFilter.has(code) ? CHIP_ACTIVE : CHIP_IDLE
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Sort popover */}
        <Popover open={sortOpen} onOpenChange={setSortOpen}>
          <PopoverTrigger
            render={
              <Button
                size="sm"
                variant={sortBy !== "relevance" ? "default" : "outline"}
                className="h-7 gap-1.5 rounded-lg px-2.5 text-xs"
              >
                <ListOrderedIcon className="size-3" />
                {sortBy === "relevance"
                  ? "Sort"
                  : SORT_OPTIONS.find((o) => o.key === sortBy)?.label}
              </Button>
            }
          />
          <PopoverContent align="start" sideOffset={6} className="w-48 p-0">
            <div className="p-1.5">
              {SORT_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setSortBy(key)
                    setSortOpen(false)
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-primary/40",
                    sortBy === key
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  <span>{label}</span>
                  {sortBy === key && (
                    <CheckIcon className="size-3.5 shrink-0 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Results */}
      {hasQuery ? (
        <div className="flex flex-col gap-0.5">
          {loading ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Searching…
            </p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {hasActiveFilters
                ? "No results match your filters"
                : `No matches for "${debounced}"`}
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
          <p className="px-1 pb-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Suggested from your course
          </p>
          {items.length === 0 && hasActiveFilters ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No suggestions match your filters
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
        "flex items-center gap-2 rounded-xl px-2 py-2",
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
        <PopoverContent align="end" sideOffset={4} className="w-52 p-0">
          <div className="border-b px-3 py-2.5">
            <p className="text-xs font-semibold text-muted-foreground">
              Add to…
            </p>
          </div>
          <div className="p-1.5">
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
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
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
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
