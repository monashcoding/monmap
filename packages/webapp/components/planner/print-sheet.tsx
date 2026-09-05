"use client"

import { useMemo } from "react"

import { summarizePlan } from "@/lib/planner/progress"
import { PERIOD_KIND_LABEL } from "@/lib/planner/teaching-period"
import type {
  PlannerCourseWithAoS,
  PlannerOffering,
  PlannerSlot,
  PlannerState,
  PlannerUnit,
} from "@/lib/planner/types"

import { usePlanner } from "./planner-context"
import { useWam } from "./wam-context"

/**
 * The printable rendering of a plan.
 *
 * `window.print()` used to hand the browser the live planner — nav
 * chrome, drag handles, kebab menus, and unit cards whose titles are
 * clipped to a fixed-width column — which prints as an unreadable
 * screenshot of an app. This is a separate document built from the
 * same state: hidden on screen (`hidden print:block`), and the only
 * thing visible on paper.
 *
 * Layout is one table per year so a year never straddles a page break
 * (`break-inside-avoid`), with the teaching period spanning its units'
 * rows rather than repeating on each.
 */
export function PrintSheet() {
  const { state, course, units, offerings, plans, activePlanId, currentUser } =
    usePlanner()
  const { grades } = useWam()

  return (
    <PrintSheetView
      state={state}
      course={course}
      units={units}
      offerings={offerings}
      grades={grades}
      planName={plans.find((p) => p.id === activePlanId)?.name ?? "Course plan"}
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
  planName: string
  userName: string | null
}

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
  planName,
  userName,
}: PrintSheetViewProps) {
  const summary = useMemo(
    () => summarizePlan(state, course, units, offerings),
    [state, course, units, offerings]
  )

  const startYear = Number(state.courseYear) || new Date().getFullYear()

  // A Mark column is dead weight for the majority who never enter
  // grades, so it only appears once at least one planned unit has one.
  const showMarks = useMemo(
    () =>
      state.years.some((y) =>
        y.slots.some((s) => s.unitCodes.some((c) => grades.get(c) != null))
      ),
    [state.years, grades]
  )

  const selectedAos = useMemo(() => {
    if (!course) return []
    const codes = new Set(
      Object.values(state.selectedAos).filter((c): c is string => Boolean(c))
    )
    return [...codes].flatMap((code) => {
      const aos = course.areasOfStudy.find((a) => a.code === code)
      return aos ? [aos] : []
    })
  }, [course, state.selectedAos])

  const credit = state.credit ?? []
  const creditTotal = credit.reduce((n, c) => n + c.creditPoints, 0)

  const printedOn = new Date().toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  return (
    <section className="hidden text-black print:block">
      <header className="mb-4 border-b border-neutral-400 pb-3">
        <h1 className="text-lg font-bold">{planName}</h1>
        {course ? (
          <p className="mt-0.5 text-[11px]">
            {course.code} — {course.title}
          </p>
        ) : null}
        <p className="mt-0.5 text-[10px] text-neutral-600">
          {state.courseYear} handbook
          {state.campus ? ` · ${state.campus} campus` : ""}
          {userName ? ` · ${userName}` : ""} · printed {printedOn}
        </p>
        {selectedAos.length > 0 ? (
          <ul className="mt-1.5 text-[10px]">
            {selectedAos.map((aos) => (
              <li key={aos.code}>
                <span className="font-semibold">{aos.relationshipLabel}:</span>{" "}
                {aos.title} ({aos.code})
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      {state.years.map((year, yearIndex) => {
        const calYear = startYear + yearIndex
        const slots = year.slots.filter((s) => s.unitCodes.length > 0)
        const yearCp = summary.creditPointsByYear[yearIndex] ?? 0
        return (
          <table
            key={yearIndex}
            className="mb-4 w-full border-collapse break-inside-avoid text-[10px]"
          >
            <caption className="mb-1 text-left text-[11px] font-bold">
              {year.label} · {calYear}
              <span className="float-right font-normal text-neutral-600">
                {yearCp} cp
              </span>
            </caption>
            <thead>
              <tr className="border-y border-neutral-400 text-left">
                <Th className="w-[108px]">Period</Th>
                <Th className="w-[72px]">Code</Th>
                <Th>Unit</Th>
                <Th className="w-[36px] text-right">CP</Th>
                {showMarks ? (
                  <Th className="w-[44px] text-right">Mark</Th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {slots.length === 0 ? (
                <tr className="border-b border-neutral-200">
                  <td
                    className="py-1 text-neutral-500"
                    colSpan={showMarks ? 5 : 4}
                  >
                    No units planned.
                  </td>
                </tr>
              ) : (
                slots.map((slot, slotIndex) =>
                  slot.unitCodes.map((code, i) => {
                    const unit = units.get(code)
                    const mark = grades.get(code)
                    return (
                      <tr
                        key={`${slotIndex}:${code}:${i}`}
                        className="border-b border-neutral-200 align-top"
                      >
                        {i === 0 ? (
                          <td
                            rowSpan={slot.unitCodes.length}
                            className="py-1 pr-2 font-semibold whitespace-nowrap"
                          >
                            {slotLabel(slot, calYear)}
                          </td>
                        ) : null}
                        <td className="py-1 pr-2 font-semibold tabular-nums">
                          {code}
                        </td>
                        <td className="py-1 pr-2">{unit?.title ?? "—"}</td>
                        <td className="py-1 text-right tabular-nums">
                          {unit?.creditPoints ?? "—"}
                        </td>
                        {showMarks ? (
                          <td className="py-1 text-right tabular-nums">
                            {mark ?? ""}
                          </td>
                        ) : null}
                      </tr>
                    )
                  })
                )
              )}
            </tbody>
          </table>
        )
      })}

      {credit.length > 0 ? (
        <table className="mb-4 w-full border-collapse break-inside-avoid text-[10px]">
          <caption className="mb-1 text-left text-[11px] font-bold">
            Credit for prior study
            <span className="float-right font-normal text-neutral-600">
              {creditTotal} cp
            </span>
          </caption>
          <thead>
            <tr className="border-y border-neutral-400 text-left">
              <Th className="w-[72px]">Code</Th>
              <Th>Source</Th>
              <Th className="w-[36px] text-right">CP</Th>
            </tr>
          </thead>
          <tbody>
            {credit.map((entry, i) => (
              <tr key={i} className="border-b border-neutral-200">
                <td className="py-1 pr-2 font-semibold tabular-nums">
                  {entry.code ?? "Unspecified"}
                </td>
                <td className="py-1 pr-2">{entry.label ?? "—"}</td>
                <td className="py-1 text-right tabular-nums">
                  {entry.creditPoints}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <footer className="mt-2 break-inside-avoid border-t border-neutral-400 pt-2 text-[10px]">
        <p className="font-semibold">
          {summary.totalCreditPoints} of {summary.targetCreditPoints || "—"}{" "}
          credit points planned · {summary.uniqueUnitCount} units
        </p>
        {summary.duplicateUnitCodes.length > 0 ? (
          <p className="mt-0.5 text-neutral-600">
            Repeated units (counted once):{" "}
            {summary.duplicateUnitCodes.join(", ")}
          </p>
        ) : null}
        <p className="mt-1 text-neutral-600">
          Generated by MonMap (monmap.au), a course mapper by the Monash
          Association of Coding. Not an official Monash document — always
          confirm against the handbook and your course adviser.
        </p>
      </footer>
    </section>
  )
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return <th className={`py-1 pr-2 font-semibold ${className}`}>{children}</th>
}

/** The row's period name — the user's own slot label wins when set. */
function slotLabel(slot: PlannerSlot, calYear: number): string {
  return slot.label ?? `${PERIOD_KIND_LABEL[slot.kind]}, ${calYear}`
}
