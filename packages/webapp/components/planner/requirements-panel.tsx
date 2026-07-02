"use client"

import { CheckIcon, CircleIcon } from "lucide-react"
import { useMemo } from "react"

import { Badge } from "@/components/ui/badge"
import { pickedAosEntries, type PickedAosEntry } from "@/lib/planner/aos-slots"
import { summarizeAoSProgress, type AoSProgress } from "@/lib/planner/progress"
import type { PlannerAreaOfStudy, RequirementGroup } from "@/lib/planner/types"
import { cn } from "@/lib/utils"

import { usePlanner } from "./planner-context"
import { UnitDetailPopover } from "./unit-detail-popover"

/**
 * Sidebar requirements panel. Shows each picked AoS as a collapsible
 * progress card with inline unit chips that light up as the student
 * places matching codes in the plan.
 */
export function RequirementsPanel({ className }: { className?: string }) {
  const { course, state, units, plannedCodes } = usePlanner()

  // Map each placed code to where it sits in the plan so the chip's
  // popover can surface slot-specific validation.
  const placements = useMemo(() => {
    const map = new Map<string, { yearIndex: number; slotIndex: number }>()
    for (let y = 0; y < state.years.length; y++) {
      const year = state.years[y]
      for (let s = 0; s < year.slots.length; s++) {
        for (const c of year.slots[s].unitCodes) {
          if (!map.has(c)) map.set(c, { yearIndex: y, slotIndex: s })
        }
      }
    }
    return map
  }, [state.years])

  const pickedAos = useMemo(
    () => (course ? pickedAosEntries(course, state.selectedAos) : []),
    [course, state.selectedAos]
  )

  const withProgress = useMemo<(PickedAosEntry & { progress: AoSProgress })[]>(
    () =>
      pickedAos.map((p) => ({
        ...p,
        progress: summarizeAoSProgress(p.aos, plannedCodes, units),
      })),
    [pickedAos, plannedCodes, units]
  )

  return (
    <section
      className={cn("rounded-3xl border bg-card shadow-card", className)}
    >
      <div className="border-b px-4 py-2.5">
        <h2 className="text-xs font-semibold tracking-tight">
          Requirements progress
        </h2>
      </div>

      <div className="flex flex-col divide-y">
        {course && course.componentCourses.length > 0 ? (
          <>
            {/* Parent-level groups shared across components (e.g. F2016's
                architecture half lives on the double degree itself). */}
            {course.courseRequirements.length > 0 ? (
              <CourseBlock
                requirements={course.courseRequirements}
                plannedCodes={plannedCodes}
                placements={placements}
              />
            ) : null}
            {course.componentCourses.map((comp) => {
              const compAos = withProgress.filter(({ aos }) =>
                aosBelongsToComponent(aos, comp)
              )
              return (
                <div key={comp.courseCode} className="flex flex-col divide-y">
                  <CourseBlock
                    title={comp.courseTitle}
                    requirements={comp.courseRequirements}
                    plannedCodes={plannedCodes}
                    placements={placements}
                  />
                  {compAos.map(({ slotKey, label, aos, progress }) => (
                    <AoSBlock
                      key={`${slotKey}:${aos.code}`}
                      label={label}
                      aos={aos}
                      progress={progress}
                      plannedCodes={plannedCodes}
                      placements={placements}
                    />
                  ))}
                </div>
              )
            })}
            {/* AoS without a matching component (shouldn't happen for double degrees but just in case) */}
            {withProgress
              .filter(
                ({ aos }) =>
                  !course.componentCourses.some((c) =>
                    aosBelongsToComponent(aos, c)
                  )
              )
              .map(({ slotKey, label, aos, progress }) => (
                <AoSBlock
                  key={`${slotKey}:${aos.code}`}
                  label={label}
                  aos={aos}
                  progress={progress}
                  plannedCodes={plannedCodes}
                  placements={placements}
                />
              ))}
          </>
        ) : course && course.courseRequirements.length > 0 ? (
          <>
            <CourseBlock
              requirements={course.courseRequirements}
              plannedCodes={plannedCodes}
              placements={placements}
            />
            {withProgress.map(({ slotKey, label, aos, progress }) => (
              <AoSBlock
                key={`${slotKey}:${aos.code}`}
                label={label}
                aos={aos}
                progress={progress}
                plannedCodes={plannedCodes}
                placements={placements}
              />
            ))}
          </>
        ) : withProgress.length === 0 ? (
          <div className="px-4 py-6 text-center text-[11px] text-muted-foreground">
            {course && course.areasOfStudy.length === 0
              ? "The handbook has no structured requirements for this course."
              : "Pick a major, minor or specialisation to see listed units."}
          </div>
        ) : (
          withProgress.map(({ slotKey, label, aos, progress }) => (
            <AoSBlock
              key={`${slotKey}:${aos.code}`}
              label={label}
              aos={aos}
              progress={progress}
              plannedCodes={plannedCodes}
              placements={placements}
            />
          ))
        )}
      </div>
    </section>
  )
}

/**
 * Structural AoS→component join on course code, with a display-label
 * fallback for AoS records that predate `componentCourseCode` (rows
 * cached or persisted before the field existed). Labels differ in case
 * and trailing whitespace between the tree and the sub-course refs, so
 * the fallback compares loosely.
 */
function aosBelongsToComponent(
  aos: PlannerAreaOfStudy,
  comp: { courseCode: string; componentTitle: string }
): boolean {
  if (aos.componentCourseCode)
    return aos.componentCourseCode === comp.courseCode
  if (!aos.componentLabel) return false
  return (
    aos.componentLabel.trim().toLowerCase() ===
    comp.componentTitle.trim().toLowerCase()
  )
}

function CourseBlock({
  requirements,
  plannedCodes,
  placements,
  title = "Course requirements",
}: {
  requirements: RequirementGroup[]
  plannedCodes: ReadonlySet<string>
  placements: ReadonlyMap<string, { yearIndex: number; slotIndex: number }>
  title?: string
}) {
  const totals = useMemo(
    () => computeTotals(requirements, plannedCodes),
    [requirements, plannedCodes]
  )
  const completionPct =
    totals.total === 0 ? 0 : Math.round((totals.satisfied / totals.total) * 100)

  return (
    <section className="px-4 py-3">
      <header className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <Badge
            variant="default"
            className="bg-primary/40 text-[9px] font-normal text-primary-foreground hover:bg-primary/55"
          >
            Degree
          </Badge>
          <h3 className="mt-0.5 truncate text-xs font-semibold">{title}</h3>
        </div>
        <div className="text-right leading-tight">
          <div className="text-[11px] tabular-nums">
            <span className="font-semibold">{totals.satisfied}</span>
            <span className="text-muted-foreground">/{totals.total}</span>
          </div>
          <div className="text-[9px] text-muted-foreground">required</div>
        </div>
      </header>

      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${completionPct}%` }}
        />
      </div>

      <GroupList
        requirements={requirements}
        plannedCodes={plannedCodes}
        placements={placements}
      />
    </section>
  )
}

function AoSBlock({
  label,
  aos,
  progress,
  plannedCodes,
  placements,
}: {
  /** Kind label for the badge, e.g. "Major" or "Specialisation". */
  label: string
  aos: PlannerAreaOfStudy
  progress: AoSProgress
  plannedCodes: ReadonlySet<string>
  placements: ReadonlyMap<string, { yearIndex: number; slotIndex: number }>
}) {
  const completionPct =
    progress.totalRequired === 0
      ? 0
      : Math.round((progress.satisfiedCount / progress.totalRequired) * 100)

  return (
    <section className="px-4 py-3">
      <header className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-[9px] font-normal">
              {label}
            </Badge>
            {aos.code.includes(":") ? null : (
              <span className="text-[9px] text-muted-foreground">
                {aos.code}
              </span>
            )}
          </div>
          <h3 className="mt-0.5 truncate text-xs font-semibold">{aos.title}</h3>
        </div>
        <div className="text-right leading-tight">
          <div className="text-[11px] tabular-nums">
            <span className="font-semibold">{progress.satisfiedCount}</span>
            <span className="text-muted-foreground">
              /{progress.totalRequired}
            </span>
          </div>
          <div className="text-[9px] text-muted-foreground">required</div>
        </div>
      </header>

      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${completionPct}%` }}
        />
      </div>

      <GroupList
        requirements={aos.requirements}
        plannedCodes={plannedCodes}
        placements={placements}
      />
    </section>
  )
}

function computeTotals(
  requirements: ReadonlyArray<RequirementGroup>,
  plannedCodes: ReadonlySet<string>
): { satisfied: number; total: number } {
  let satisfied = 0
  let total = 0
  for (const g of requirements) {
    total += g.required
    let placed = 0
    for (const c of g.options) if (plannedCodes.has(c)) placed++
    satisfied += Math.min(placed, g.required)
  }
  return { satisfied, total }
}

/**
 * Renders each grouping with all listed options as chips. Choice
 * groupings (required < options.length) get an amber "pick X of Y"
 * badge, dashed chip outline, and stop counting toward progress once
 * X picks are reached — though every placed option still shows green.
 */
function GroupList({
  requirements,
  plannedCodes,
  placements,
}: {
  requirements: ReadonlyArray<RequirementGroup>
  plannedCodes: ReadonlySet<string>
  placements: ReadonlyMap<string, { yearIndex: number; slotIndex: number }>
}) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      {requirements.map((g) => {
        const placedCount = g.options.reduce(
          (n, c) => n + (plannedCodes.has(c) ? 1 : 0),
          0
        )
        const isChoice = g.required < g.options.length
        const satisfied = placedCount >= g.required
        const sortedOptions = [...g.options].sort((a, b) => a.localeCompare(b))
        return (
          <div key={g.grouping}>
            <div className="mb-1 flex items-center gap-1.5">
              <div className="text-[9px] tracking-wide text-muted-foreground uppercase">
                {g.grouping}
              </div>
              {isChoice ? (
                <span
                  className={cn(
                    "rounded px-1 py-px text-[8px] font-medium tracking-wide uppercase",
                    satisfied
                      ? "bg-success-soft text-success-foreground"
                      : "bg-primary/40 text-primary-foreground"
                  )}
                >
                  Pick {g.required} of {g.options.length}
                </span>
              ) : null}
              {g.scope ? (
                <span className="rounded bg-info/30 px-1 py-px text-[8px] font-medium tracking-wide text-info-foreground uppercase">
                  {g.scope}
                </span>
              ) : null}
              <span className="ml-auto text-[9px] text-muted-foreground tabular-nums">
                {Math.min(placedCount, g.required)}/{g.required}
              </span>
            </div>
            <ul className="flex flex-wrap gap-1">
              {sortedOptions.map((code) => {
                const placed = plannedCodes.has(code)
                const placement = placements.get(code)
                return (
                  <li key={`${g.grouping}:${code}`}>
                    <UnitDetailPopover
                      code={code}
                      yearIndex={placement?.yearIndex}
                      slotIndex={placement?.slotIndex}
                    >
                      <button
                        type="button"
                        aria-label={`Details for ${code}`}
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-0.5 rounded-md border px-1 py-0.5 text-[9px] tabular-nums transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                          placed
                            ? "border-success/40 bg-success-soft text-success-foreground hover:bg-success/20"
                            : isChoice
                              ? "border-dashed border-border text-muted-foreground"
                              : "border-border text-muted-foreground"
                        )}
                      >
                        {placed ? (
                          <CheckIcon className="size-2" />
                        ) : (
                          <CircleIcon className="size-2" />
                        )}
                        {code}
                      </button>
                    </UnitDetailPopover>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
