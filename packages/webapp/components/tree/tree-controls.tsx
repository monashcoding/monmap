"use client"

import type { PlannerAreaOfStudy, PlannerCourse } from "@/lib/planner/types"
import type { TreeControlsValue } from "@/lib/tree/payload"

import { CourseBlock } from "./controls/course-block"
import { Legend } from "./controls/legend"
import { ModeBlock } from "./controls/mode-block"
import { PlanBlock } from "./controls/plan-block"
import { UnitBlock } from "./controls/unit-block"

export type { TreeControlsValue } from "@/lib/tree/payload"

export interface TreeControlsProps {
  value: TreeControlsValue
  onChange: (next: TreeControlsValue) => void
  availableYears: string[]
  courses: PlannerCourse[]
  /** AoS options for the currently selected course; empty if none chosen. */
  aosOptions: PlannerAreaOfStudy[]
  /** Whether the signed-in user has a plan we can colour by. */
  canUsePlan: boolean
  /** Background data fetch in flight. Surfaced as a small inline note. */
  loading?: boolean
}

/**
 * Orchestrating control panel for the Unit Tree view. Renders the
 * appropriate mode/course/unit blocks plus the legend; each section
 * lives in its own file under `./controls/` for readability.
 */
export function TreeControls({
  value,
  onChange,
  availableYears,
  courses,
  aosOptions,
  canUsePlan,
  loading,
}: TreeControlsProps) {
  const set = <K extends keyof TreeControlsValue>(
    k: K,
    v: TreeControlsValue[K]
  ) => onChange({ ...value, [k]: v })

  return (
    <aside className="flex flex-col gap-3 sm:gap-4">
      <ModeBlock value={value.mode} onModeChange={(m) => set("mode", m)} />

      {value.mode === "course" ? (
        <CourseBlock
          courses={courses}
          aosOptions={aosOptions}
          courseCode={value.courseCode}
          aosCode={value.aosCode}
          year={value.year}
          depth={value.depth}
          availableYears={availableYears}
          onCourseChange={(c) =>
            onChange({ ...value, courseCode: c, aosCode: null })
          }
          onAosChange={(a) => set("aosCode", a)}
          onYearChange={(y) => set("year", y)}
          onDepthChange={(d) => set("depth", d)}
        />
      ) : (
        <UnitBlock
          unitCode={value.unitCode}
          year={value.year}
          depth={value.depth}
          direction={value.direction}
          availableYears={availableYears}
          onUnitChange={(c) => set("unitCode", c)}
          onDirectionChange={(d) => set("direction", d)}
          onYearChange={(y) => set("year", y)}
          onDepthChange={(d) => set("depth", d)}
        />
      )}

      {canUsePlan ? (
        <PlanBlock
          enabled={value.useMyPlan}
          onEnabledChange={(b) => set("useMyPlan", b)}
        />
      ) : null}

      <Legend />
      {loading ? (
        <p className="animate-pulse px-2 text-[11px] text-muted-foreground">
          loading…
        </p>
      ) : null}
    </aside>
  )
}
