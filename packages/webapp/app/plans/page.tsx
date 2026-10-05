import type { Metadata } from "next"
import { GraduationCapIcon } from "lucide-react"

import { AppHeader } from "@/components/app-header"

export const metadata: Metadata = {
  title: "My course maps",
  description:
    "Saved course plans for your Monash degree - synced across devices.",
  robots: { index: false, follow: false },
}
import { GoogleSignInButton } from "@/components/google-sign-in-button"
import { createBlankPlanAction } from "@/app/actions"
import { getCurrentUser } from "@/lib/auth-server"
import { MAX_PLANS_PER_USER } from "@/lib/db/input"
import {
  fetchCoursesMeta,
  fetchUnitCreditPointsBatch,
  listAvailableYears,
  listUserPlansWithState,
  type CourseMeta,
  type PlanWithState,
} from "@/lib/db/queries"
import type { PlannerState } from "@/lib/planner/types"

import { NewPlanButton, NewPlanCard } from "./new-plan-button"
import { PlanCard } from "./plan-card"

// Tolerates a malformed stored state, so one bad row cannot break the
// page.
function allUnitCodes(state: PlannerState): string[] {
  const seen = new Set<string>()
  for (const year of state.years ?? []) {
    for (const slot of year?.slots ?? []) {
      for (const code of slot?.unitCodes ?? []) seen.add(code)
    }
  }
  return [...seen]
}

export interface PlanPageData {
  plan: PlanWithState
  course: CourseMeta | null
  totalCreditPoints: number
}

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams])
  if (!user) {
    return (
      <main className="mx-auto flex min-h-svh max-w-[1500px] flex-col gap-3 px-3 pt-3 pb-12 sm:gap-5 sm:px-5 sm:pt-5">
        <AppHeader />
        <div className="flex flex-col items-center gap-4 rounded-panel border bg-card py-20 text-center shadow-card">
          <GraduationCapIcon className="size-10 text-muted-foreground/40" />
          <div className="flex flex-col gap-1">
            <p className="text-base font-semibold">
              Sign in to view your course maps
            </p>
            <p className="text-sm text-muted-foreground">
              Save your plan to your account so it follows you across devices.
            </p>
          </div>
          <GoogleSignInButton callbackURL="/plans" />
        </div>
      </main>
    )
  }

  const [plans, availableYears] = await Promise.all([
    listUserPlansWithState(user.id),
    listAvailableYears(),
  ])

  // Course metadata for all distinct (courseCode, courseYear) pairs and
  // unit credit points per handbook year, fetched in parallel.
  const coursePairs = [
    ...new Map(
      plans
        .filter((p) => p.state.courseCode)
        .map((p) => [
          `${p.state.courseCode}:${p.state.courseYear}`,
          { code: p.state.courseCode!, year: p.state.courseYear },
        ])
    ).values(),
  ]
  const codesByYear = new Map<string, Set<string>>()
  for (const plan of plans) {
    const yr = plan.state.courseYear
    if (!codesByYear.has(yr)) codesByYear.set(yr, new Set())
    for (const code of allUnitCodes(plan.state)) {
      codesByYear.get(yr)!.add(code)
    }
  }
  const [courseMetas, cpEntries] = await Promise.all([
    fetchCoursesMeta(coursePairs),
    Promise.all(
      [...codesByYear].map(
        async ([yr, codes]) =>
          [yr, await fetchUnitCreditPointsBatch([...codes], yr)] as const
      )
    ),
  ])
  const courseMap = new Map(courseMetas.map((c) => [`${c.code}:${c.year}`, c]))
  const cpMaps = new Map(cpEntries)

  const pageData: PlanPageData[] = plans.map((plan) => {
    const cpMap = cpMaps.get(plan.state.courseYear) ?? {}
    const totalCreditPoints = allUnitCodes(plan.state).reduce(
      (sum, code) => sum + (cpMap[code] ?? 6),
      0
    )
    return {
      plan,
      course:
        courseMap.get(`${plan.state.courseCode}:${plan.state.courseYear}`) ??
        null,
      totalCreditPoints,
    }
  })

  return (
    <main className="mx-auto flex min-h-svh max-w-[1500px] flex-col gap-3 px-3 pt-3 pb-12 sm:gap-5 sm:px-5 sm:pt-5">
      <AppHeader />

      {params.error === "limit" ? (
        <p role="alert" className="text-sm text-destructive">
          You have reached the limit of {MAX_PLANS_PER_USER} plans. Delete a
          plan to make a new one.
        </p>
      ) : null}

      {plans.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-panel border bg-card py-20 text-center shadow-card">
          <GraduationCapIcon className="size-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No plans saved yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {pageData.map((d) => (
            <PlanCard key={d.plan.id} data={d} />
          ))}
        </div>
      )}

      {plans.length === 0 ? (
        // First plan: nothing to choose between yet, so skip the year
        // prompt and let the server pick the latest handbook year.
        // Subsequent plans go through NewPlanButton's dialog.
        <form action={createBlankPlanAction}>
          <NewPlanCard type="submit" />
        </form>
      ) : (
        <NewPlanButton availableYears={availableYears} />
      )}
    </main>
  )
}
