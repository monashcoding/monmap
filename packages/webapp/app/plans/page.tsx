import { GraduationCapIcon, PlusIcon } from "lucide-react"

import { AppHeader } from "@/components/app-header"
import { GoogleSignInButton } from "@/components/google-sign-in-button"
import { createBlankPlanAction } from "@/app/actions"
import { getCurrentUser } from "@/lib/auth-server"
import {
  fetchCoursesMeta,
  fetchUnitCreditPointsBatch,
  listUserPlansWithState,
  type CourseMeta,
  type PlanWithState,
} from "@/lib/db/queries"
import type { PlannerState } from "@/lib/planner/types"

import { PlanCard } from "./plan-card"

function allUnitCodes(state: PlannerState): string[] {
  const seen = new Set<string>()
  for (const year of state.years) {
    for (const slot of year.slots) {
      for (const code of slot.unitCodes) seen.add(code)
    }
  }
  return [...seen]
}

export interface PlanPageData {
  plan: PlanWithState
  course: CourseMeta | null
  totalCreditPoints: number
}

export default async function PlansPage() {
  const user = await getCurrentUser()
  if (!user) {
    return (
      <main className="mx-auto flex min-h-svh max-w-[1500px] flex-col gap-3 px-3 pt-3 pb-12 sm:gap-5 sm:px-5 sm:pt-5">
        <AppHeader />
        <div className="flex flex-col items-center gap-4 rounded-3xl border bg-card py-20 text-center shadow-card">
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

  const plans = await listUserPlansWithState(user.id)

  // Batch-fetch course metadata for all distinct (courseCode, courseYear) pairs.
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
  const courseMetas = await fetchCoursesMeta(coursePairs)
  const courseMap = new Map(courseMetas.map((c) => [`${c.code}:${c.year}`, c]))

  // Batch-fetch unit credit points for each plan's handbook year.
  // Group unit codes by year to avoid redundant queries.
  const codesByYear = new Map<string, Set<string>>()
  for (const plan of plans) {
    const yr = plan.state.courseYear
    if (!codesByYear.has(yr)) codesByYear.set(yr, new Set())
    for (const code of allUnitCodes(plan.state)) {
      codesByYear.get(yr)!.add(code)
    }
  }
  const cpMaps = new Map<string, Record<string, number>>()
  await Promise.all(
    [...codesByYear.entries()].map(async ([yr, codes]) => {
      cpMaps.set(yr, await fetchUnitCreditPointsBatch([...codes], yr))
    })
  )

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

      {plans.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border bg-card py-20 text-center shadow-card">
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

      <form action={createBlankPlanAction} className="flex justify-center">
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--monash-purple)]/40 bg-[var(--monash-purple-soft)] px-5 py-3 text-sm font-semibold text-[var(--monash-purple-deep)] transition-colors hover:border-[var(--monash-purple)] hover:bg-[var(--monash-purple)]/10"
        >
          <PlusIcon className="size-4" />
          New plan
        </button>
      </form>
    </main>
  )
}
