/**
 * Review shapes shared by the server and the browser. Kept apart from
 * `lib/db/reviews.ts` so client components can import them without
 * pulling in the database client.
 */

export interface RatingSummary {
  /** Mean overall rating, or null with no reviews. */
  average: number | null
  count: number
}

export const NO_RATINGS: RatingSummary = { average: null, count: 0 }

export interface ReviewSummary extends RatingSummary {
  /** Reviews per overall rating; index 0 is 1 star. */
  distribution: [number, number, number, number, number]
  /** Mean and count per axis id, for the axes anyone rated. */
  axes: Record<string, { average: number; count: number }>
}

export interface PublicReview {
  id: string
  overall: number
  ratings: Record<string, number>
  body: string
  yearTaken: string | null
  initials: string
  createdAt: string
  edited: boolean
}

export const REVIEW_SORTS = ["recent", "highest", "lowest"] as const

export type ReviewSort = (typeof REVIEW_SORTS)[number]

export const REVIEW_PAGE_SIZE = 10
