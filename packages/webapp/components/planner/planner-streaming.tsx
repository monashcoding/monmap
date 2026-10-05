"use client"

import { use } from "react"

import type { UnitBundle } from "@/lib/planner/unit-cache"

import { Planner, type PlannerProps } from "./planner"

type Props = Omit<PlannerProps, "prewarmed"> & {
  /**
   * Pre-warmed units/offerings/requisites delivered as a Promise so the
   * server can flush the planner shell (header, sidebar, empty grid)
   * before this work completes. Consumed via React 19 `use()` — the
   * surrounding `<Suspense>` boundary defines what the user sees while
   * the promise is pending.
   */
  prewarmedPromise: Promise<UnitBundle>
}

/**
 * Thin wrapper that unwraps the streamed prewarm payload and hands a
 * concrete `prewarmed` object to the standard <Planner>. Lives in its
 * own module so the page can wrap it in <Suspense> without pulling the
 * whole planner tree into the suspense boundary.
 */
export function PlannerStreaming({ prewarmedPromise, ...rest }: Props) {
  return <Planner {...rest} prewarmed={use(prewarmedPromise)} />
}
