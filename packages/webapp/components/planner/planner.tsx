"use client"

import { Suspense } from "react"

import type { PlanSummary } from "@/lib/db/queries"
import type {
  PlannerCourse,
  PlannerCourseWithAoS,
  PlannerState,
} from "@/lib/planner/types"
import type { UnitBundle } from "@/lib/planner/unit-cache"

import { AppHeader } from "@/components/app-header"

import { SaveStatusBadge } from "./save-status-badge"
import { LeftSidebar } from "./left-sidebar"
import { PlanGrid, PlannerDnd } from "./plan-grid"
import { PlanMapSection } from "./plan-map-section"
import { PlannerProvider, type PlannerCurrentUser } from "./planner-context"
import { PrintOnArrival } from "./print-on-arrival"
import { PrintSheet } from "./print-sheet"
import { RightSidebar } from "./right-sidebar"
import { SummaryBar } from "./summary-bar"
import { WamProvider } from "./wam-context"

export interface PlannerProps {
  initialYear: string
  availableYears: string[]
  courses: PlannerCourse[]
  defaultCourse: PlannerCourseWithAoS | null
  /** Unit data the server already loaded for the course and the plan. */
  prewarmed: UnitBundle
  currentUser: PlannerCurrentUser | null
  /**
   * Pre-fetched plan state for signed-in users (the active one); null
   * when anonymous or when the user has no saved plans yet.
   */
  initialPlan: PlannerState | null
  /** Pre-fetched plan summaries for the user; empty for anon. */
  initialPlans: PlanSummary[]
  /** Pre-selected plan id (whose state is `initialPlan`); null when anon
   * or signed-in-with-no-plans. */
  initialActivePlanId: string | null
  initialGrades: Record<string, number> | null
  /**
   * A course from a "Plan this course" link (`/?course=`). With no
   * saved plan the server already opened it; over a saved plan the
   * student is offered a switch rather than losing their plan.
   */
  requestedCourse?: string | null
}

/**
 * Two columns under the header: the plan sheet (plan toolbar, repeated
 * units note, semester grid, then the plan map), and from lg up a
 * 340px course panel beside it. Below lg the course panel stacks under
 * the plan; below md it moves into a bottom sheet.
 */
export function Planner({ initialGrades, ...props }: PlannerProps) {
  return (
    <PlannerProvider {...props}>
      <WamProvider
        signedIn={props.currentUser !== null}
        initialGrades={initialGrades}
      >
        {/* `contents` keeps the screen layout flat inside <main>'s flex
            column; `print:hidden` swaps the whole interactive app out
            for <PrintSheet /> on paper. */}
        <div className="contents print:hidden">
          <AppHeader>
            <SaveStatusBadge />
          </AppHeader>

          <PlannerDnd>
            {/* Two sheets of paper: the plan (header, summary, grid) and
                the course panel. Inside each sheet, sections are split
                by hairlines rather than nested floating cards. */}
            <div className="grid flex-1 items-start gap-3 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="flex min-w-0 flex-col gap-3 sm:gap-5">
                <div className="flex min-w-0 flex-col overflow-hidden rounded-panel border bg-card shadow-card">
                  <div className="border-b px-3 py-3 sm:px-4">
                    <LeftSidebar />
                  </div>
                  <SummaryBar />
                  <PlanGrid />
                </div>
                <PlanMapSection />
              </div>

              <RightSidebar />
            </div>
          </PlannerDnd>
        </div>

        <PrintSheet />
        {/* useSearchParams needs a Suspense boundary of its own. */}
        <Suspense fallback={null}>
          <PrintOnArrival />
        </Suspense>
      </WamProvider>
    </PlannerProvider>
  )
}
