import { json, RATINGS_CACHE, searchParams } from "@/lib/api/server"
import { listPublicReviews } from "@/lib/db/reviews"
import { isReviewKind } from "@/lib/reviews/axes"
import { cleanEntityCode, cleanListParams } from "@/lib/reviews/input"
import { REVIEW_PAGE_SIZE } from "@/lib/reviews/types"

/**
 * One page of an entity's published reviews, as the review list shows
 * them: initials, never a name, email or user id. The visitor's own
 * review is a server action, because it depends on the session.
 *
 * GET /api/reviews?code=FIT1008&kind=unit&offset=10&sort=highest
 */
export const dynamic = "force-dynamic"

export async function GET(req: Request): Promise<Response> {
  const params = searchParams(req)
  const kind = params.get("kind")
  const code = cleanEntityCode(params.get("code"))
  if (!isReviewKind(kind) || !code) return json([], RATINGS_CACHE)
  const reviews = await listPublicReviews(kind, code, {
    ...cleanListParams(params.get("sort"), Number(params.get("offset"))),
    limit: REVIEW_PAGE_SIZE,
  })
  return json(reviews, RATINGS_CACHE)
}
