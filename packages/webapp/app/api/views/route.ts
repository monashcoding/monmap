import { createRateLimiter, handleRoute } from "@monashcoding/server"
import { z } from "zod"

import { ROUTE_OPTIONS } from "@/lib/api/server"
import { recordView, refreshEntityStatsIfStale } from "@/lib/db/entity-stats"
import { logger } from "@/lib/log"
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

const viewBody = z.object({ kind: z.unknown(), code: z.unknown() })

// One address may send 300 views a minute; more are dropped without
// a different answer. Generous, because a campus network shares one
// address, and a visitor's repeat views already count once a day.
const viewLimiter = createRateLimiter({ limit: 300, windowMs: 60_000 })

const NO_CONTENT = () =>
  new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } })

export const POST = handleRoute<unknown>(async function POST(req: Request) {
  const userAgent = req.headers.get("user-agent") ?? ""
  const ip = clientIp(req.headers)
  if (!ip || isBot(userAgent)) return NO_CONTENT()
  if (!viewLimiter.check(ip).allowed) return NO_CONTENT()

  let json: unknown
  try {
    json = JSON.parse((await req.text()).slice(0, 200))
  } catch {
    return NO_CONTENT()
  }
  const body = viewBody.safeParse(json)
  if (!body.success) return NO_CONTENT()
  const { kind } = body.data
  const code = cleanEntityCode(body.data.code)
  if (!isReviewKind(kind) || !code) return NO_CONTENT()

  const day = viewDay()
  try {
    await recordView(kind, code, day, visitorKey(day, ip, userAgent))
  } catch (err) {
    logger.error("recordView failed", err)
  }
  refreshEntityStatsIfStale()
  return NO_CONTENT()
}, ROUTE_OPTIONS)
