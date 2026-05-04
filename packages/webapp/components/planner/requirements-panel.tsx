"use client"

import { CheckIcon, CircleIcon } from "lucide-react"
import { useMemo } from "react"

import { Badge } from "@/components/ui/badge"
import { summarizeAoSProgress, type AoSProgress } from "@/lib/planner/progress"
import type {
  PlannerAreaOfStudy,
  PlannerState,
  RequirementGroup,
} from "@/lib/planner/types"
import { cn } from "@/lib/utils"

import { usePlanner } from "./planner-context"

const ROLE_LABEL: Record<keyof PlannerState["selectedAos"], string> = {
  major: "Major",
  extendedMajor: "Extended major",
  minor: "Minor",
  specialisation: "Specialisation",
  specialisation2: "Specialisation",
  elective: "Elective",
}

/**
 * Sidebar requirements panel. Shows each picked AoS as a collapsible
 * progress card with inline unit chips that light up as the student
 * places matching codes in the plan.
 */
export function RequirementsPanel() {
  const { course, state, units, plannedCodes } = usePlanner()

  const pickedAos = useMemo((): PickedAoS[] => {
    if (!course) return []
    const picked: PickedAoS[] = []
    for (const [role, code] of Object.entries(state.selectedAos)) {
      if (!code) continue
      const aos = course.areasOfStudy.find((a) => a.code === code)
      if (!aos) continue
      picked.push({ role: role as keyof PlannerState["selectedAos"], aos })
    }
    return picked
  }, [course, state.selectedAos])

  const withProgress = useMemo<(PickedAoS & { progress: AoSProgress })[]>(
    () =>
      pickedAos.map((p) => ({
        ...p,
        progress: summarizeAoSProgress(p.aos, plannedCodes, units),
      })),
    [pickedAos, plannedCodes, units]
  )

  return (
    <section className="rounded-3xl border bg-card shadow-card">
      <div className="border-b px-4 py-2.5">
        <h2 className="text-xs font-semibold tracking-tight">
          Requirements progress
        </h2>
      </div>

      <div className="flex flex-col divide-y">
        {course && course.courseRequirements.length > 0 ? (
          <CourseBlock
            requirements={course.courseRequirements}
            plannedCodes={plannedCodes}
          />
        ) : null}

        {withProgress.length === 0 &&
        (!course || course.courseRequirements.length === 0) ? (
          <div className="px-4 py-6 text-center text-[11px] text-muted-foreground">
            Pick a major, minor or specialisation to see listed units.
          </div>
        ) : (
          withProgress.map(({ role, aos, progress }) => (
            <AoSBlock
              key={`${role}:${aos.code}`}
              role={role}
              aos={aos}
              progress={progress}
              plannedCodes={plannedCodes}
            />
          ))
        )}
      </div>
    </section>
  )
}

interface PickedAoS {
  role: keyof PlannerState["selectedAos"]
  aos: PlannerAreaOfStudy
}

function CourseBlock({
  requirements,
  plannedCodes,
}: {
  requirements: RequirementGroup[]
  plannedCodes: ReadonlySet<string>
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
            className="bg-primary/15 text-[9px] font-normal text-primary hover:bg-primary/20"
          >
            Degree
          </Badge>
          <h3 className="mt-0.5 truncate text-xs font-semibold">
            Course requirements
          </h3>
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

      <GroupList requirements={requirements} plannedCodes={plannedCodes} />
    </section>
  )
}

function AoSBlock({
  role,
  aos,
  progress,
  plannedCodes,
}: {
  role: keyof PlannerState["selectedAos"]
  aos: PlannerAreaOfStudy
  progress: AoSProgress
  plannedCodes: ReadonlySet<string>
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
              {ROLE_LABEL[role]}
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

      <GroupList requirements={aos.requirements} plannedCodes={plannedCodes} />
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
}: {
  requirements: ReadonlyArray<RequirementGroup>
  plannedCodes: ReadonlySet<string>
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
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                  )}
                >
                  Pick {g.required} of {g.options.length}
                </span>
              ) : null}
              <span className="ml-auto text-[9px] text-muted-foreground tabular-nums">
                {Math.min(placedCount, g.required)}/{g.required}
              </span>
            </div>
            <ul className="flex flex-wrap gap-1">
              {sortedOptions.map((code) => {
                const placed = plannedCodes.has(code)
                return (
                  <li key={`${g.grouping}:${code}`}>
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 rounded-md border px-1 py-0.5 text-[9px] tabular-nums transition-colors",
                        placed
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
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
                    </span>
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
