/**
 * Checks on what a browser sends to the review server actions. Every
 * server action is a public POST endpoint, so these checks are what
 * stands between hostile input and the database. Kept free of
 * server-only imports so `node --test` can load it.
 */

import {
  BODY_MAX,
  BODY_MIN,
  cleanRatings,
  isRating,
  isReviewKind,
  type ReviewKind,
} from "./axes.ts"
import { REVIEW_SORTS, type ReviewSort } from "./types.ts"

/** The most codes one ratings request may ask for. */
export const MAX_RATING_CODES = 300

const MAX_OFFSET = 10_000

/** An upper-cased unit, course or AoS code, or null if it can't be one. */
export function cleanEntityCode(v: unknown): string | null {
  if (typeof v !== "string") return null
  const code = v.trim().toUpperCase()
  return /^[A-Z0-9-]{2,16}$/.test(code) ? code : null
}

/** What the review form sends. */
export interface ReviewInput {
  kind: ReviewKind
  code: string
  overall: number
  ratings: Record<string, number>
  body: string
  yearTaken: string | null
}

export type ParsedReview =
  | { ok: true; value: ReviewInput }
  | { ok: false; message: string }

/**
 * Validate and clean a review: a known kind and code, a whole overall
 * rating from 1 to 5, a body of BODY_MIN to BODY_MAX characters after
 * trimming, and a four-digit year or null. Unknown rating axes and
 * out-of-range scores are dropped. The messages are shown in the form.
 */
export function parseReviewInput(input: unknown): ParsedReview {
  const raw = (typeof input === "object" && input !== null ? input : {}) as {
    [K in keyof ReviewInput]?: unknown
  }
  const kind = raw.kind
  const code = cleanEntityCode(raw.code)
  if (!isReviewKind(kind) || !code) {
    return { ok: false, message: "Unknown page." }
  }
  if (!isRating(raw.overall)) {
    return { ok: false, message: "Choose an overall rating from 1 to 5 stars." }
  }
  const body = typeof raw.body === "string" ? raw.body.trim() : ""
  if (body.length < BODY_MIN || body.length > BODY_MAX) {
    return {
      ok: false,
      message: `Write between ${BODY_MIN} and ${BODY_MAX} characters.`,
    }
  }
  const yearTaken =
    typeof raw.yearTaken === "string" && /^\d{4}$/.test(raw.yearTaken)
      ? raw.yearTaken
      : null
  return {
    ok: true,
    value: {
      kind,
      code,
      overall: raw.overall,
      ratings: cleanRatings(kind, raw.ratings),
      body,
      yearTaken,
    },
  }
}

/** A known sort (default "recent") and a whole offset from 0 to 10,000. */
export function cleanListParams(
  sort: unknown,
  offset: unknown
): { sort: ReviewSort; offset: number } {
  return {
    sort: (REVIEW_SORTS as readonly unknown[]).includes(sort)
      ? (sort as ReviewSort)
      : "recent",
    offset: Number.isInteger(offset)
      ? Math.min(Math.max(offset as number, 0), MAX_OFFSET)
      : 0,
  }
}

type ReviewContent = Pick<
  ReviewInput,
  "overall" | "ratings" | "body" | "yearTaken"
>

/** Whether a save would change nothing the review shows. */
export function sameReviewContent(a: ReviewContent, b: ReviewContent): boolean {
  if (
    a.overall !== b.overall ||
    a.body !== b.body ||
    a.yearTaken !== b.yearTaken
  ) {
    return false
  }
  const ka = Object.keys(a.ratings)
  return (
    ka.length === Object.keys(b.ratings).length &&
    ka.every((k) => a.ratings[k] === b.ratings[k])
  )
}
