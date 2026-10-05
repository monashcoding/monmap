"use client"

import { memo, useDeferredValue, useEffect, useMemo } from "react"

import { pickedAosEntries } from "@/lib/planner/aos-slots"
import { slotCreditPoints } from "@/lib/planner/capacity"
import { creditPointsFromCredit } from "@/lib/planner/credit"
import { facultyStyle } from "@/lib/planner/faculty-color"
import { markToGrade } from "@/lib/planner/grades"
import {
  placedUnitCodes,
  summarizePlan,
  type ProgressSummary,
} from "@/lib/planner/progress"
import {
  slotBlockCredit,
  slotLabel,
  startLabel,
  studyYearName,
  studyYearSpan,
} from "@/lib/planner/timeline"
import {
  slotCapacity,
  type PlannerCourseWithAoS,
  type PlannerOffering,
  type PlannerSlot,
  type PlannerState,
  type PlannerUnit,
} from "@/lib/planner/types"
import { cn } from "@/lib/utils"

import { usePlanner, usePlannerSync } from "./planner-context"
import { useWam } from "./wam-context"

/**
 * The printable rendering of a plan: the planner's own layout on
 * paper. Each study year is a dark strip over one row per semester,
 * and each unit is a card with its faculty colour, code, title, credit
 * points and mark, as on screen. Hidden on screen (`hidden
 * print:block`); `planner.tsx` hides the live app when printing.
 *
 * Colours print because the sheet sets `print-color-adjust: exact`.
 * A study year never splits across pages (`break-inside-avoid`).
 */
export function PrintSheet() {
  const { state, course, units, offerings, summary, currentUser } = usePlanner()
  const { plans, activePlanId } = usePlannerSync()
  const { grades, wam, gpa } = useWam()
  const planName =
    plans.find((p) => p.id === activePlanId)?.name ?? "Course map"

  // The browser prints the document title in its page header and uses
  // it as the PDF's file name, so name it after the plan while printing.
  useEffect(() => {
    let previous = document.title
    const before = () => {
      previous = document.title
      document.title = planName
    }
    const after = () => {
      document.title = previous
    }
    window.addEventListener("beforeprint", before)
    window.addEventListener("afterprint", after)
    return () => {
      window.removeEventListener("beforeprint", before)
      window.removeEventListener("afterprint", after)
    }
  }, [planName])

  // The sheet is hidden on screen, so it re-renders at low priority,
  // after each edit has painted, rather than on the edit itself. It
  // stays mounted so printing never depends on a beforeprint event,
  // which iOS Safari doesn't reliably fire.
  const deferredState = useDeferredValue(state)
  const deferredCourse = useDeferredValue(course)
  const deferredUnits = useDeferredValue(units)
  const deferredOfferings = useDeferredValue(offerings)
  const deferredSummary = useDeferredValue(summary)

  return (
    <MemoPrintSheetView
      state={deferredState}
      course={deferredCourse}
      units={deferredUnits}
      offerings={deferredOfferings}
      summary={deferredSummary}
      grades={grades}
      wam={wam}
      gpa={gpa}
      planName={planName}
      userName={currentUser?.name ?? null}
    />
  )
}

export interface PrintSheetViewProps {
  state: PlannerState
  course: PlannerCourseWithAoS | null
  units: ReadonlyMap<string, PlannerUnit>
  offerings: ReadonlyMap<string, PlannerOffering[]>
  grades: ReadonlyMap<string, number>
  wam: number | null
  gpa: number | null
  planName: string
  userName: string | null
  /** The plan's summary when the caller already has it. */
  summary?: ProgressSummary
}

const MemoPrintSheetView = memo(PrintSheetView)

/**
 * Presentational half, split out so it can be rendered from a test or
 * a static preview without standing up the planner's providers.
 */
export function PrintSheetView({
  state,
  course,
  units,
  offerings,
  grades,
  wam,
  gpa,
  planName,
  userName,
  summary: given,
}: PrintSheetViewProps) {
  const summary = useMemo(
    () => given ?? summarizePlan(state, course, units, offerings),
    [given, state, course, units, offerings]
  )

  // In the requirements panel's order.
  const selectedAos = useMemo(
    () =>
      course
        ? pickedAosEntries(course, state.selectedAos).map((p) => p.aos)
        : [],
    [course, state.selectedAos]
  )

  const credit = state.credit ?? []
  // A code credited twice, or credited and placed, counts once.
  const creditTotal = creditPointsFromCredit(state, placedUnitCodes(state))

  const printedOn = new Date().toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  const stats: { label: string; value: string }[] = [
    {
      label: "Credit points",
      value: `${summary.totalCreditPoints} / ${summary.targetCreditPoints || "-"}`,
    },
    { label: "Units", value: String(summary.uniqueUnitCount) },
    { label: "Starts", value: startLabel(state) },
    wam !== null
      ? { label: "WAM / GPA", value: `${wam.toFixed(1)} / ${gpa?.toFixed(2)}` }
      : { label: "Handbook", value: state.courseYear },
  ]

  return (
    <section className="hidden text-[#252525] [-webkit-print-color-adjust:exact] [print-color-adjust:exact] print:block">
      <header className="mb-4 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-xl leading-tight font-bold">{planName}</h1>
          {course ? (
            <p className="mt-0.5 text-[11px]">
              <span className="font-semibold">{course.code}</span>{" "}
              {course.title}
            </p>
          ) : null}
          {selectedAos.length > 0 ? (
            <ul className="mt-1.5 flex flex-col gap-0.5 text-[9px] text-neutral-600">
              {selectedAos.map((aos) => (
                <li key={aos.code}>
                  <span className="font-semibold text-[#252525]">
                    {aos.title}
                  </span>
                  {/* Synthetic codes ("C2001:clayton-option:…") are ours,
                      not Monash's, so only real codes are shown. */}
                  {aos.code.includes(":") ? null : ` (${aos.code})`} -{" "}
                  {aos.relationshipLabel}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="shrink-0 text-right text-[9px] text-neutral-600">
          <p className="text-[11px] font-bold text-[#252525]">MonMap</p>
          {userName ? <p>{userName}</p> : null}
          <p>Printed {printedOn}</p>
        </div>
      </header>

      <dl className="mb-4 grid grid-cols-4 overflow-hidden rounded-[6px] border border-neutral-300">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={cn("px-3 py-2", i > 0 && "border-l border-neutral-300")}
          >
            <dt className="text-[8px] font-semibold tracking-wider text-neutral-500 uppercase">
              {s.label}
            </dt>
            <dd className="text-[12px] font-semibold tabular-nums">
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-3">
        {state.years.map((year, yearIndex) => (
          <YearBlock
            key={yearIndex}
            title={studyYearName(yearIndex)}
            span={studyYearSpan(state, yearIndex)}
            creditPoints={summary.creditPointsByYear[yearIndex] ?? 0}
          >
            {year.slots.map((slot, slotIndex) => (
              <SlotRow
                key={slotIndex}
                label={slotLabel(state, yearIndex, slot)}
                slot={slot}
                units={units}
                offerings={offerings}
                grades={grades}
              />
            ))}
          </YearBlock>
        ))}

        {credit.length > 0 ? (
          <YearBlock title="Credit for prior study" creditPoints={creditTotal}>
            <div className="grid grid-cols-4 gap-1.5 p-1.5">
              {credit.map((entry, i) => (
                <UnitTile
                  key={i}
                  code={entry.code ?? "Credit"}
                  title={entry.label ?? units.get(entry.code ?? "")?.title}
                  creditPoints={entry.creditPoints}
                />
              ))}
            </div>
          </YearBlock>
        ) : null}
      </div>

      <footer className="mt-4 break-inside-avoid text-[8.5px] leading-relaxed text-neutral-500">
        {summary.duplicateUnitCodes.length > 0 ? (
          <p>
            Repeated units, counted once:{" "}
            {summary.duplicateUnitCodes.join(", ")}.
          </p>
        ) : null}
        <p>
          Made with MonMap (monmap.monashcoding.com) by the Monash Association
          of Coding. This is not an official Monash document: check your plan
          against the handbook and with your course adviser.
        </p>
      </footer>
    </section>
  )
}

function YearBlock({
  title,
  span,
  creditPoints,
  children,
}: {
  title: string
  span?: string
  creditPoints: number
  children: React.ReactNode
}) {
  return (
    <div className="break-inside-avoid overflow-hidden rounded-[8px] border border-neutral-300">
      <div className="flex items-baseline justify-between bg-[#252525] px-3 py-1.5 text-[9px] font-semibold tracking-wider text-white uppercase">
        <span>
          {title}
          {span ? (
            <span className="ml-1.5 font-medium text-white/55">({span})</span>
          ) : null}
        </span>
        <span className="font-medium text-white/70 normal-case">
          {creditPoints} credit points
        </span>
      </div>
      {children}
    </div>
  )
}

function SlotRow({
  label,
  slot,
  units,
  offerings,
  grades,
}: {
  label: string
  slot: PlannerSlot
  units: ReadonlyMap<string, PlannerUnit>
  offerings: ReadonlyMap<string, PlannerOffering[]>
  grades: ReadonlyMap<string, number>
}) {
  const slotCp = slotCreditPoints(slot, units, offerings)
  // Four columns like the planner; a part-time or summer slot still
  // lines up with the semesters above and below it.
  const columns = Math.max(4, slot.unitCodes.length)
  const empty = Math.max(
    0,
    Math.min(slotCapacity(slot), columns) - slot.unitCodes.length
  )

  return (
    <div className="grid grid-cols-[104px_minmax(0,1fr)] border-t border-neutral-300">
      <div className="bg-neutral-50 px-3 py-2">
        <p className="text-[10px] font-semibold">{label}</p>
        <p className="text-[8.5px] text-neutral-500">{slotCp} credit points</p>
      </div>
      {slot.status ? (
        <div className="flex items-center px-3 text-[9.5px] text-neutral-600 italic">
          {slot.status === "exchange"
            ? `On exchange, ${slotBlockCredit(slot)} credit points`
            : "On leave"}
        </div>
      ) : (
        <div
          className="grid gap-1.5 p-1.5"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {slot.unitCodes.map((code, i) => {
            const unit = units.get(code)
            const mark = grades.get(code)
            return (
              <UnitTile
                key={`${code}:${i}`}
                code={code}
                title={unit?.title}
                creditPoints={unit?.creditPoints}
                mark={mark}
              />
            )
          })}
          {Array.from({ length: empty }, (_, i) => (
            <div
              key={`empty:${i}`}
              className="min-h-[44px] rounded-[5px] border border-dashed border-neutral-300"
            />
          ))}
        </div>
      )}
    </div>
  )
}

function UnitTile({
  code,
  title,
  creditPoints,
  mark,
}: {
  code: string
  title: string | undefined
  creditPoints: number | undefined
  mark?: number
}) {
  const faculty = facultyStyle(code)
  return (
    <div className="flex min-h-[44px] overflow-hidden rounded-[5px] border border-neutral-300 bg-white">
      <div aria-hidden className={cn("w-1.5 shrink-0", faculty.railClass)} />
      <div className="flex min-w-0 flex-1 flex-col px-1.5 py-1">
        <p className="text-[9.5px] font-bold tabular-nums">{code}</p>
        {title ? (
          <p className="text-[8px] leading-snug text-neutral-700">{title}</p>
        ) : null}
        <div className="mt-auto flex items-baseline justify-between gap-1 pt-0.5 text-[7.5px] text-neutral-500">
          <span>
            {creditPoints != null ? `${creditPoints} credit points` : ""}
          </span>
          {mark != null ? (
            <span className="rounded-[3px] bg-neutral-100 px-1 font-semibold text-[#252525] tabular-nums">
              {markToGrade(mark)} {mark}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
