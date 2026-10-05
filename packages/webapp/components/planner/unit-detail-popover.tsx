"use client"

import { CalendarIcon, ChevronDownIcon, InfoIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"

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
import { OfferingsGrid } from "@/components/unit-detail/offerings-grid"
import {
  blocksWithRules,
  RequisiteRuleBlock,
} from "@/components/unit-detail/requisite-block"
import { UnitDetailHeader } from "@/components/unit-detail/unit-detail-header"
import { UnitSynopsis } from "@/components/unit-detail/unit-synopsis"
import { useUnitText } from "@/components/unit-detail/use-unit-text"
import { fetchUnits } from "@/lib/api/client"
import { entityHref } from "@/lib/handbook/links"
import { handbookYearFor } from "@/lib/planner/timeline"
import {
  completedBefore,
  keyFor,
  withEquivalents,
} from "@/lib/planner/validation"
import type {
  PlannerOffering,
  PlannerUnit,
  RequisiteBlock,
} from "@/lib/planner/types"
import { RatingInline } from "@/components/reviews/stars"
import { useRating } from "@/components/reviews/use-ratings"
import { cn } from "@/lib/utils"

import { usePlanner } from "./planner-context"

/**
 * Popover that shows everything the student might want to see about
 * a unit:
 *   - synopsis (HTML from handbook, loaded when the view opens)
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
        className="max-h-[min(70svh,520px,var(--available-height))] w-[min(520px,calc(100vw-2rem))] overflow-y-auto overscroll-none p-0 shadow-2xl ring-foreground/15 dark:ring-foreground/20"
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
  const rating = useRating("unit", code)

  // Default to the handbook year the planner uses for this slot (or
  // the plan's first year when unplaced), so the view usually renders
  // from context; year-switching is opt-in and fetches a one-off
  // snapshot for just this code.
  const defaultYear = useMemo(() => {
    if (yearIndex !== undefined)
      return handbookYearFor(yearIndex, state.courseYear, availableYears)
    return availableYears.includes(state.courseYear)
      ? state.courseYear
      : ([...availableYears].sort().at(-1) ?? state.courseYear)
  }, [yearIndex, state.courseYear, availableYears])

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

  // Context data serves the view only when it is the selected year's:
  // the planner may hold this code from another plan year. A fallback
  // unit (see PlannerUnit.fallbackFor) stands in for its requested year.
  const contextUnit = units.get(code)
  const usingCurrentYear =
    selectedYear ===
    (contextUnit ? (contextUnit.fallbackFor ?? contextUnit.year) : defaultYear)

  const [otherYearData, setOtherYearData] = useState<{
    year: string
    unit: PlannerUnit | null
    offerings: PlannerOffering[]
    requisites: RequisiteBlock[]
  } | null>(null)
  const fetchedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!active || usingCurrentYear) return
    const key = `${code}:${selectedYear}`
    if (fetchedKeyRef.current === key && otherYearData?.year === selectedYear) {
      return
    }
    const controller = new AbortController()
    fetchUnits([code], selectedYear, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return
        fetchedKeyRef.current = key
        setOtherYearData({
          year: selectedYear,
          unit: res.units[code] ?? null,
          offerings: res.offerings[code] ?? [],
          requisites: res.requisites[code] ?? [],
        })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setOtherYearData({
          year: selectedYear,
          unit: null,
          offerings: [],
          requisites: [],
        })
      })
    return () => controller.abort()
  }, [active, usingCurrentYear, selectedYear, code, otherYearData?.year])

  const otherYearMatches =
    !usingCurrentYear && otherYearData?.year === selectedYear
  // Derived rather than stored, so an aborted request (the student
  // picked the default year again mid-fetch) can't leave it stuck.
  const loading = active && !usingCurrentYear && !otherYearMatches
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

  // Expand with equivalents so a requisite leaf naming FIT1045 reads as
  // satisfied when the student took its twin FIT1053 — keeping the tree's
  // checkmarks consistent with validateUnitInSlot, which does the same.
  // completedBefore already adds credit and equivalents.
  const completed = useMemo(
    () =>
      isPlaced
        ? completedBefore(state, yearIndex, slotIndex, units)
        : withEquivalents(plannedCodes, units),
    [isPlaced, state, yearIndex, slotIndex, plannedCodes, units]
  )

  // Links name the year whose data is shown: a fallback unit's page is
  // its own year's.
  const linkYear = unit?.year ?? selectedYear
  const href = entityHref("unit", code, linkYear)
  const { text, loading: textLoading } = useUnitText(
    [code],
    active && unit ? unit.year : null
  )

  return (
    <div className={className}>
      <UnitDetailHeader
        code={code}
        href={href}
        creditPoints={unit?.creditPoints}
        title={unit?.title ?? null}
        fallback={loading ? "Loading…" : "Not in this year's handbook"}
        codeClassName="font-semibold"
        afterCode={
          <YearPicker
            year={selectedYear}
            years={availableYears}
            onChange={setSelectedYear}
            isDefault={selectedYear === defaultYear}
          />
        }
        className="pb-3"
      >
        <div className="min-h-4">
          {rating ? (
            <Link
              href={`${entityHref("unit", code)}#reviews`}
              className="rounded-tag underline-offset-2 hover:underline"
            >
              <RatingInline summary={rating} size="xs" />
            </Link>
          ) : null}
        </div>
        {unit?.fallbackFor ? (
          <p className="text-[11px] text-muted-foreground">
            From the {unit.year} handbook. The {unit.fallbackFor} page
            isn&apos;t published yet.
          </p>
        ) : null}
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
      </UnitDetailHeader>

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
                className="flex gap-2 rounded-control bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive"
              >
                <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
                <span>{issue.message}</span>
              </li>
            ))}
            {validation.warnings.map((issue, i) => (
              <li
                key={`warn-${i}`}
                className="flex gap-2 rounded-control bg-warning-soft px-2.5 py-1.5 text-xs text-warning-foreground"
              >
                <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <UnitSynopsis
        html={text[code]?.synopsis}
        // An inactive view with a unit is about to ask (the search
        // dialog waits for the pointer to settle): hold the space.
        loading={textLoading || (!active && !!unit)}
        linkYear={linkYear}
        className="border-b pt-2 pb-4"
      />

      <section className="border-b pt-2 pb-4">
        <h4 className="mb-1.5 text-[10px] tracking-wide text-muted-foreground uppercase">
          Offerings
        </h4>
        {unitOfferings.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            {loading ? "Loading…" : "No offerings listed."}
          </p>
        ) : (
          <OfferingsGrid
            offerings={unitOfferings}
            labelClassName="w-22 whitespace-nowrap"
          />
        )}
      </section>

      {unitReqs.length > 0 ? (
        <section className="pt-2">
          {blocksWithRules(unitReqs).map((block, i) => (
            <RequisiteRuleBlock
              key={i}
              block={block}
              completed={completed}
              units={units}
            />
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
            aria-label={`Viewing ${year} handbook - change year`}
            className={cn(
              "inline-flex items-center gap-1 rounded-control border px-1.5 py-0.5 text-[10px] tabular-nums transition-colors",
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
