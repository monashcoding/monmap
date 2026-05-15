"use client"

import { use } from "react"

import type { PlanSummary } from "@/lib/db/queries"
import type {
  PlannerCourse,
  PlannerCourseWithAoS,
  PlannerOffering,
  PlannerState,
  PlannerUnit,
  RequisiteBlock,
} from "@/lib/planner/types"

import { Planner } from "./planner"
import type { PlannerCurrentUser } from "./planner-context"

interface Prewarmed {
  units: Record<string, PlannerUnit>
  offerings: Record<string, PlannerOffering[]>
  requisites: Record<string, RequisiteBlock[]>
}

interface Props {
  initialYear: string
  availableYears: string[]
  courses: PlannerCourse[]
  defaultCourse: PlannerCourseWithAoS | null
  /**
   * Pre-warmed units/offerings/requisites delivered as a Promise so the
   * server can flush the planner shell (header, sidebar, empty grid)
   * before this work completes. Consumed via React 19 `use()` — the
   * surrounding `<Suspense>` boundary defines what the user sees while
   * the promise is pending.
   */
  prewarmedPromise: Promise<Prewarmed>
  currentUser: PlannerCurrentUser | null
  initialPlan: PlannerState | null
  initialPlans: PlanSummary[]
  initialActivePlanId: string | null
  initialGrades: Record<string, number> | null
}

/**
 * Thin wrapper that unwraps the streamed prewarm payload and hands a
 * concrete `prewarmed` object to the standard <Planner>. Lives in its
 * own module so the page can wrap it in <Suspense> without pulling the
 * whole planner tree into the suspense boundary.
 */
export function PlannerStreaming(props: Props) {
  const prewarmed = use(props.prewarmedPromise)
  return (
    <Planner
      initialYear={props.initialYear}
      availableYears={props.availableYears}
      courses={props.courses}
      defaultCourse={props.defaultCourse}
      prewarmed={prewarmed}
      currentUser={props.currentUser}
      initialPlan={props.initialPlan}
      initialPlans={props.initialPlans}
      initialActivePlanId={props.initialActivePlanId}
      initialGrades={props.initialGrades}
    />
  )
}
