import { handleRoute } from "@monashcoding/server"

import { MAX_RATING_CODES, splitCodes } from "@/lib/api/query"
import { json, RATINGS_CACHE, searchParams, ROUTE_OPTIONS } from "@/lib/api/server"
import { ratingSummaries } from "@/lib/db/reviews"
import { isReviewKind } from "@/lib/reviews/axes"
import { cleanEntityCode } from "@/lib/reviews/input"

/**
 * Overall ratings for up to MAX_RATING_CODES codes of one kind, for
 * lists rendered in the browser. Ratings are averages over published
 * reviews, so the answer is the same for every visitor.
 *
 * GET /api/ratings?codes=FIT1008,FIT1045&kind=unit
 */
export const dynamic = "force-dynamic"

export const GET = handleRoute<unknown>(async function GET(req: Request) {
  const params = searchParams(req)
  const kind = params.get("kind")
  const codes = splitCodes(
    params.get("codes"),
    MAX_RATING_CODES,
    cleanEntityCode
  )
  if (!isReviewKind(kind) || codes.length === 0) return json({}, RATINGS_CACHE)
  return json(await ratingSummaries(kind, codes), RATINGS_CACHE)
}, ROUTE_OPTIONS)
