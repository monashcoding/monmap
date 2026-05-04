"use client"

import { Toaster } from "@/components/ui/sonner"
import type { PlanSummary } from "@/lib/db/queries"
import type {
  PlannerCourse,
  PlannerCourseWithAoS,
  PlannerOffering,
  PlannerState,
  PlannerUnit,
  RequisiteBlock,
} from "@/lib/planner/types"

import { Header } from "./header"
import { LeftSidebar } from "./left-sidebar"
import { PlanGrid } from "./plan-grid"
import { PlannerProvider, type PlannerCurrentUser } from "./planner-context"
import { RightSidebar } from "./right-sidebar"
import { SummaryBar } from "./summary-bar"

interface PlannerProps {
  initialYear: string
  availableYears: string[]
  courses: PlannerCourse[]
  defaultCourse: PlannerCourseWithAoS | null
  prewarmed: {
    units: Record<string, PlannerUnit>
    offerings: Record<string, PlannerOffering[]>
    requisites: Record<string, RequisiteBlock[]>
  }
  currentUser: PlannerCurrentUser | null
  initialPlan: PlannerState | null
  initialPlans: PlanSummary[]
  initialActivePlanId: string | null
}

/**
 * Three-column layout matching MonPlan:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ header                                                       │
 *   ├────────┬──────────────────────────────────────┬──────────────┤
 *   │ left   │ credit summary                       │ right        │
 *   │ rail   │ semester rows (label | unit cards)   │ progression  │
 *   │        │                                      │ guide        │
 *   └────────┴──────────────────────────────────────┴──────────────┘
 */
export function Planner(props: PlannerProps) {
  return (
    <PlannerProvider
      initialYear={props.initialYear}
      availableYears={props.availableYears}
      courses={props.courses}
      defaultCourse={props.defaultCourse}
      prewarmed={props.prewarmed}
      currentUser={props.currentUser}
      initialPlan={props.initialPlan}
      initialPlans={props.initialPlans}
      initialActivePlanId={props.initialActivePlanId}
    >
      <Header />

      <div className="grid flex-1 gap-5 lg:grid-cols-[72px_minmax(0,1fr)_340px]">
        <LeftSidebar />

        <div className="flex min-w-0 flex-col gap-5">
          <SummaryBar />
          <PlanGrid />
        </div>

        <RightSidebar />
      </div>

      <Toaster position="bottom-right" richColors closeButton />
    </PlannerProvider>
  )
}
