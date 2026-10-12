import { recordView, refreshEntityStatsIfStale } from "@/lib/db/entity-stats"
import { isReviewKind } from "@/lib/reviews/axes"
import { cleanEntityCode } from "@/lib/reviews/input"
import { clientIp, isBot, viewDay, visitorKey } from "@/lib/views/visitor"

/**
 * One view of a unit, course or area of study page, sent by
 * components/handbook/view-beacon.tsx. The answer is always 204, so a
 * caller learns nothing about what counted.
 *
 * POST /api/views  {"kind": "unit", "code": "FIT2004"}
 */
export const dynamic = "force-dynamic"

const NO_CONTENT = () =>
  new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } })

export async function POST(req: Request): Promise<Response> {
  const userAgent = req.headers.get("user-agent") ?? ""
  const ip = clientIp(req.headers)
  if (!ip || isBot(userAgent)) return NO_CONTENT()

  let body: unknown
  try {
    body = JSON.parse((await req.text()).slice(0, 200))
  } catch {
    return NO_CONTENT()
  }
  const { kind, code: rawCode } = (body ?? {}) as Record<string, unknown>
  const code = cleanEntityCode(rawCode)
  if (!isReviewKind(kind) || !code) return NO_CONTENT()

  const day = viewDay()
  try {
    await recordView(kind, code, day, visitorKey(day, ip, userAgent))
  } catch (err) {
    console.error("recordView failed", err)
  }
  refreshEntityStatsIfStale()
  return NO_CONTENT()
}
