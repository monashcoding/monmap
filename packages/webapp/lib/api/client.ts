/**
 * Browser calls to the public GET endpoints under app/api. Next runs
 * server actions one at a time per tab, so a search or a ratings batch
 * used to wait behind an autosave. These requests run in parallel, the
 * browser can cache them, and `signal` aborts one that is out of date.
 */
import type {
  PlannerCourse,
  PlannerCourseWithAoS,
  PlannerUnit,
  UnitText,
} from "@/lib/planner/types"
import type { UnitBundle } from "@/lib/planner/unit-cache"
import type {
  PublicReview,
  RatingSummary,
  ReviewSort,
} from "@/lib/reviews/types"
import type { ReviewKind } from "@/lib/reviews/axes"
import type { TreeControlsValue, TreeGraphPayload } from "@/lib/tree/payload"
import type { TreeEdge } from "@/lib/tree/types"

import { apiUrl, chunkCodes, joinCodes } from "@/lib/api/query"

export type PlannerYearData = {
  courses: PlannerCourse[] | null
  course: PlannerCourseWithAoS | null
} & UnitBundle

export type RichSearchResult = UnitBundle & { rank: Record<string, number> }

export interface PlanGraphData {
  edges: TreeEdge[]
  units: Record<string, PlannerUnit>
}

/** Whether `err` is the rejection of an aborted request. */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError"
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`The server answered ${res.status}`)
  return (await res.json()) as T
}

/** Bundles merged into one; a later bundle wins for the same code. */
function mergeBundles(parts: readonly UnitBundle[]): UnitBundle {
  if (parts.length === 1) return parts[0]
  return {
    units: Object.assign({}, ...parts.map((p) => p.units)),
    offerings: Object.assign({}, ...parts.map((p) => p.offerings)),
    requisites: Object.assign({}, ...parts.map((p) => p.requisites)),
  }
}

/**
 * The course and the data for every unit it can place, plus the year's
 * course list when `withCourses`.
 */
export function fetchPlannerYear(
  year: string,
  courseCode: string | null,
  withCourses: boolean
): Promise<PlannerYearData> {
  return getJson(
    apiUrl("/api/planner-year", {
      year,
      course: courseCode,
      courses: withCourses ? "1" : null,
    })
  )
}

/**
 * Unit data for `codes` in one handbook year, in as many requests as
 * the URL length needs.
 */
export async function fetchUnits(
  codes: Iterable<string>,
  year: string,
  signal?: AbortSignal
): Promise<UnitBundle> {
  const parts = await Promise.all(
    chunkCodes(codes).map((chunk) =>
      getJson<UnitBundle>(
        apiUrl("/api/units", { year, codes: chunk.join(",") }),
        signal
      )
    )
  )
  return parts.length > 0
    ? mergeBundles(parts)
    : { units: {}, offerings: {}, requisites: {} }
}

/**
 * Unit data across handbook years, one year per request, merged in the
 * map's order.
 */
export async function fetchUnitsByYear(
  codesByYear: ReadonlyMap<string, readonly string[]>,
  signal?: AbortSignal
): Promise<UnitBundle> {
  const parts = await Promise.all(
    [...codesByYear].map(([year, codes]) => fetchUnits(codes, year, signal))
  )
  return mergeBundles(parts)
}

/** Units whose code or title matches `q`, at most 25. */
export function fetchUnitSearch(
  q: string,
  year: string,
  signal?: AbortSignal
): Promise<PlannerUnit[]> {
  return getJson(apiUrl("/api/units/search", { q, year }), signal)
}

/**
 * A wider pool of matches with their offerings and requisites, for the
 * planner to rerank. `rank` is the server's text-match order by code.
 */
export function fetchRichUnitSearch(
  q: string,
  year: string,
  signal?: AbortSignal
): Promise<RichSearchResult> {
  return getJson(apiUrl("/api/units/search-rich", { q, year }), signal)
}

/** The synopsis and enrolment rules of up to MAX_TEXT_CODES units. */
export function fetchUnitText(
  codes: readonly string[],
  year: string
): Promise<Record<string, UnitText>> {
  return getJson(apiUrl("/api/units/text", { year, codes: joinCodes(codes) }))
}

/** The requisite graph for `controls`. */
export function fetchTreeData(
  controls: TreeControlsValue,
  signal?: AbortSignal
): Promise<TreeGraphPayload> {
  return getJson(
    apiUrl("/api/tree", {
      year: controls.year,
      mode: controls.mode,
      direction: controls.direction,
      course: controls.courseCode,
      unit: controls.unitCode,
      aos: controls.aosCode,
    }),
    signal
  )
}

/**
 * The prerequisite links between up to MAX_GRAPH_CODES units, with
 * their data. The route keeps the first MAX_GRAPH_CODES in sort order.
 */
export function fetchPlanGraph(
  codes: readonly string[],
  year: string,
  signal?: AbortSignal
): Promise<PlanGraphData> {
  return getJson(
    apiUrl("/api/plan-graph", { year, codes: joinCodes(codes) }),
    signal
  )
}

/** Overall ratings for up to MAX_RATING_CODES codes of one kind. */
export function fetchRatings(
  kind: ReviewKind,
  codes: readonly string[]
): Promise<Record<string, RatingSummary>> {
  return getJson(apiUrl("/api/ratings", { kind, codes: joinCodes(codes) }))
}

/** One page of an entity's published reviews. */
export function fetchReviews(
  kind: ReviewKind,
  code: string,
  sort: ReviewSort,
  offset: number
): Promise<PublicReview[]> {
  return getJson(
    apiUrl("/api/reviews", {
      kind,
      code,
      sort,
      offset: offset > 0 ? String(offset) : null,
    })
  )
}
