"use client"

import {
  CalendarIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  InfoIcon,
  Share2Icon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { hydrateUnitsAction } from "@/app/actions"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { PERIOD_KIND_LABEL } from "@/lib/planner/teaching-period"
import { keyFor } from "@/lib/planner/validation"
import type {
  PeriodKind,
  PlannerOffering,
  PlannerUnit,
  RequisiteBlock,
} from "@/lib/planner/types"
import { cn } from "@/lib/utils"

import { usePlanner } from "./planner-context"
import { RequisiteTreeView } from "./requisite-tree-view"

/**
 * Popover that shows everything the student might want to see about
 * a unit:
 *   - synopsis (HTML from handbook)
 *   - offerings (which periods + locations are offered)
 *   - prerequisite / corequisite trees (with student's completion state)
 *   - prohibitions
 *   - validation issues (only when opened from a placed slot)
 *
 * `yearIndex` / `slotIndex` are optional — when omitted the popover is
 * in "unplaced" mode: no slot-specific validation, completed-before
 * for requisite trees falls back to every currently-placed unit.
 *
 * The header includes a small year selector so the student can view
 * the same unit in a different handbook year (offerings + requisites
 * can shift across years). Switching just changes what this popover
 * displays — it does not move the unit in the plan.
 */
export function UnitDetailPopover({
  code,
  yearIndex,
  slotIndex,
  children,
  // Suffixed with "Action" so Next.js's "use client" entry-file lint
  // (which flags non-Action-suffixed function props as not provably
  // serializable across the server/client boundary) stays quiet. The
  // callback is a plain client-side handler — the suffix is purely a
  // naming convention to satisfy the rule.
  onOpenChangeAction,
}: {
  code: string
  yearIndex?: number
  slotIndex?: number
  children: React.ReactNode
  onOpenChangeAction?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)

  function handleOpenChange(o: boolean) {
    setOpen(o)
    onOpenChangeAction?.(o)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger render={children as React.ReactElement} />
      <PopoverContent
        align="start"
        side="right"
        sideOffset={8}
        collisionPadding={16}
        initialFocus={false}
        finalFocus={false}
        className="max-h-[min(70svh,520px)] w-[min(520px,calc(100vw-2rem))] overflow-y-auto overscroll-none p-0 shadow-2xl ring-foreground/15 dark:ring-foreground/20"
      >
        <UnitDetailView
          code={code}
          yearIndex={yearIndex}
          slotIndex={slotIndex}
          active={open}
          className="p-4"
        />
      </PopoverContent>
    </Popover>
  )
}

/**
 * The full unit detail body — header, validation issues, synopsis,
 * offerings, requisites. Extracted from the popover so other surfaces
 * (e.g. the search dialog's right pane) can render the same content
 * inline. `active` gates the cross-year fetch so the view doesn't
 * over-fetch when it's mounted but not visible (the popover passes its
 * `open` here). When the view is always visible — like in the dialog —
 * leave `active` at its default `true`.
 */
export function UnitDetailView({
  code,
  yearIndex,
  slotIndex,
  active = true,
  className,
}: {
  code: string
  yearIndex?: number
  slotIndex?: number
  active?: boolean
  className?: string
}) {
  const {
    units,
    offerings,
    requisites,
    validations,
    state,
    plannedCodes,
    availableYears,
  } = usePlanner()

  const isPlaced = yearIndex !== undefined && slotIndex !== undefined

  // Default to the year the planner's unit data was loaded for so the
  // view renders instantly from context; year-switching is opt-in and
  // fetches a one-off snapshot for just this code.
  const defaultYear = useMemo(() => {
    return availableYears.includes(state.courseYear)
      ? state.courseYear
      : ([...availableYears].sort().at(-1) ?? state.courseYear)
  }, [state.courseYear, availableYears])

  const [selectedYear, setSelectedYear] = useState(defaultYear)

  // Reset the year picker back to the default whenever the focused
  // code changes (so the dialog's "next focused unit" starts fresh)
  // or whenever the view re-activates (so reopening the popover
  // doesn't surface a stale pick from a previous session). Done in
  // render — the React-recommended pattern for "derive state from a
  // prop change" — instead of an effect, which would burn a useless
  // paint cycle.
  const [lastCode, setLastCode] = useState(code)
  const [lastActive, setLastActive] = useState(active)
  if (lastCode !== code) {
    setLastCode(code)
    setSelectedYear(defaultYear)
  } else if (active && !lastActive) {
    setLastActive(active)
    setSelectedYear(defaultYear)
  } else if (active !== lastActive) {
    setLastActive(active)
  }

  const usingCurrentYear = selectedYear === state.courseYear

  const [otherYearData, setOtherYearData] = useState<{
    year: string
    unit: PlannerUnit | null
    offerings: PlannerOffering[]
    requisites: RequisiteBlock[]
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const fetchedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!active || usingCurrentYear) return
    const key = `${code}:${selectedYear}`
    if (fetchedKeyRef.current === key && otherYearData?.year === selectedYear) {
      return
    }
    let cancelled = false
    setLoading(true)
    hydrateUnitsAction([code], selectedYear)
      .then((res) => {
        if (cancelled) return
        fetchedKeyRef.current = key
        setOtherYearData({
          year: selectedYear,
          unit: res.units[code] ?? null,
          offerings: res.offerings[code] ?? [],
          requisites: res.requisites[code] ?? [],
        })
      })
      .catch(() => {
        if (cancelled) return
        setOtherYearData({
          year: selectedYear,
          unit: null,
          offerings: [],
          requisites: [],
        })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [active, usingCurrentYear, selectedYear, code, otherYearData?.year])

  const otherYearMatches =
    !usingCurrentYear && otherYearData?.year === selectedYear
  const unit = usingCurrentYear
    ? (units.get(code) ?? null)
    : otherYearMatches
      ? (otherYearData?.unit ?? null)
      : null
  const unitOfferings = usingCurrentYear
    ? (offerings.get(code) ?? [])
    : otherYearMatches
      ? (otherYearData?.offerings ?? [])
      : []
  const unitReqs = usingCurrentYear
    ? (requisites.get(code) ?? [])
    : otherYearMatches
      ? (otherYearData?.requisites ?? [])
      : []
  const validation = isPlaced
    ? validations.get(keyFor(yearIndex, slotIndex, code))
    : undefined

  const completed = useMemo(
    () =>
      isPlaced
        ? collectCompletedBefore(state, yearIndex, slotIndex)
        : new Set(plannedCodes),
    [isPlaced, state, yearIndex, slotIndex, plannedCodes]
  )

  return (
    <div className={className}>
      <header className="flex flex-col gap-1 border-b pb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold tabular-nums">{code}</span>
          {unit ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {unit.creditPoints}cp
            </span>
          ) : null}
          <YearPicker
            year={selectedYear}
            years={availableYears}
            onChange={setSelectedYear}
            isDefault={selectedYear === defaultYear}
          />
          <a
            href={`/tree?unit=${code}&year=${selectedYear}`}
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Share2Icon className="size-3" />
            Tree
          </a>
          <a
            href={`https://handbook.monash.edu/${selectedYear}/units/${code}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLinkIcon className="size-3" />
            Handbook
          </a>
        </div>
        <h3 className="text-sm leading-snug font-medium">
          {unit?.title ??
            (loading ? "Loading…" : "Not in this year's handbook")}
        </h3>
        {unit?.level || unit?.school ? (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {unit?.level ? (
              <Badge variant="secondary" className="text-[10px]">
                {unit.level}
              </Badge>
            ) : null}
            {unit?.school ? (
              <Badge variant="outline" className="text-[10px] font-normal">
                {unit.school}
              </Badge>
            ) : null}
          </div>
        ) : null}
      </header>

      {validation &&
      (validation.errors.length > 0 || validation.warnings.length > 0) ? (
        <section className="border-b pt-2 pb-4">
          <h4 className="mb-1.5 text-[10px] tracking-wide text-muted-foreground uppercase">
            Issues in this slot
          </h4>
          <ul className="flex flex-col gap-1.5">
            {validation.errors.map((issue, i) => (
              <li
                key={`err-${i}`}
                className="flex gap-2 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive"
              >
                <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
                <span>{issue.message}</span>
              </li>
            ))}
            {validation.warnings.map((issue, i) => (
              <li
                key={`warn-${i}`}
                className="flex gap-2 rounded-lg bg-warning-soft px-2.5 py-1.5 text-xs text-warning-foreground"
              >
                <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {unit?.synopsis ? (
        <section className="border-b pt-2 pb-4">
          <h4 className="mb-1.5 text-[10px] tracking-wide text-muted-foreground uppercase">
            About
          </h4>
          <div
            className="prose-sm line-clamp-6 text-xs leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_br]:hidden [&_p]:mt-0 [&_p]:mb-2 [&_p:empty]:hidden [&_p:last-child]:mb-0"
            dangerouslySetInnerHTML={{ __html: unit.synopsis }}
          />
        </section>
      ) : null}

      <section className="border-b pt-2 pb-4">
        <h4 className="mb-1.5 text-[10px] tracking-wide text-muted-foreground uppercase">
          Offerings
        </h4>
        {unitOfferings.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            {loading ? "Loading…" : "No offerings listed."}
          </p>
        ) : (
          <OfferingsGrid offerings={unitOfferings} />
        )}
      </section>

      {unitReqs.length > 0 ? (
        <section className="pt-2">
          {unitReqs
            .filter((r) => r.rule && r.rule.length > 0)
            .map((block, i) => (
              <RequisiteBlockView key={i} block={block} completed={completed} />
            ))}
        </section>
      ) : null}
    </div>
  )
}

function YearPicker({
  year,
  years,
  onChange,
  isDefault,
}: {
  year: string
  years: string[]
  onChange: (y: string) => void
  isDefault: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Viewing ${year} handbook — change year`}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] tabular-nums transition-colors",
              isDefault
                ? "border-border text-muted-foreground hover:text-foreground"
                : "border-primary/40 bg-primary/40 text-primary-foreground hover:bg-primary/55"
            )}
          />
        }
      >
        <CalendarIcon className="size-2.5" />
        {year}
        <ChevronDownIcon className="size-2.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4}>
        {years.map((y) => (
          <DropdownMenuItem
            key={y}
            disabled={y === year}
            onClick={() => onChange(y)}
            className="text-xs tabular-nums"
          >
            {y}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function OfferingsGrid({ offerings }: { offerings: PlannerOffering[] }) {
  // Group by period-kind so a student sees "S1: Clayton, Malaysia · S2: Clayton"
  const grouped = new Map<
    PeriodKind,
    { location: string; attendance: string | null }[]
  >()
  for (const o of offerings) {
    const list = grouped.get(o.periodKind) ?? []
    list.push({ location: o.location ?? "—", attendance: o.attendanceModeCode })
    grouped.set(o.periodKind, list)
  }

  const ordered: PeriodKind[] = [
    "S1",
    "S2",
    "SUMMER_A",
    "SUMMER_B",
    "WINTER",
    "FULL_YEAR",
    "OTHER",
  ]
  return (
    <ul className="flex flex-col gap-1.5 text-xs">
      {ordered
        .filter((k) => grouped.has(k))
        .map((k) => (
          <li key={k} className="flex items-baseline gap-2">
            <span className="w-14 shrink-0 text-[10px] tracking-wide text-muted-foreground uppercase">
              {PERIOD_KIND_LABEL[k]}
            </span>
            <span className="flex flex-wrap gap-1">
              {grouped.get(k)!.map((o, i) => (
                <Badge
                  key={i}
                  variant="secondary"
                  className="text-[10px] font-normal"
                >
                  {o.location}
                  {o.attendance ? (
                    <span className="ml-1 text-muted-foreground">
                      · {o.attendance}
                    </span>
                  ) : null}
                </Badge>
              ))}
            </span>
          </li>
        ))}
    </ul>
  )
}

function RequisiteBlockView({
  block,
  completed,
}: {
  block: RequisiteBlock
  completed: ReadonlySet<string>
}) {
  const label =
    block.requisiteType[0].toUpperCase() + block.requisiteType.slice(1) + "s"
  return (
    <div className="mb-3 last:mb-0">
      <h4
        className={cn(
          "mb-1.5 text-[10px] tracking-wide uppercase",
          block.requisiteType === "prohibition"
            ? "text-destructive"
            : "text-muted-foreground"
        )}
      >
        {label}
      </h4>
      <RequisiteTreeView
        rule={block.rule}
        completed={completed}
        isProhibition={block.requisiteType === "prohibition"}
      />
    </div>
  )
}

function collectCompletedBefore(
  state: ReturnType<typeof usePlanner>["state"],
  yearIndex: number,
  slotIndex: number
): Set<string> {
  const out = new Set<string>()
  for (let y = 0; y <= yearIndex; y++) {
    const year = state.years[y]
    for (let s = 0; s < year.slots.length; s++) {
      if (y === yearIndex && s >= slotIndex) break
      for (const c of year.slots[s].unitCodes) out.add(c)
    }
  }
  return out
}
