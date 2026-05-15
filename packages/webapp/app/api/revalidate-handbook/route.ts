import { revalidateTag } from "next/cache"
import { NextResponse } from "next/server"

/**
 * POST /api/revalidate-handbook?token=...
 *
 * Busts the `handbook` cache tag — every query wrapped with
 * `cacheHandbook(...)` in lib/db/queries.ts is invalidated atomically.
 * Hit from the ingest CLI after a fresh handbook import, or manually
 * (e.g. `curl -X POST ".../api/revalidate-handbook?token=$TOKEN"`).
 *
 * Requires HANDBOOK_REVALIDATE_TOKEN to be set; refuses the request if
 * the env var is missing so a misconfigured deploy can't be busted by
 * anyone.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const expected = process.env.HANDBOOK_REVALIDATE_TOKEN
  if (!expected) {
    return NextResponse.json(
      { error: "HANDBOOK_REVALIDATE_TOKEN not configured" },
      { status: 503 },
    )
  }
  const provided = new URL(request.url).searchParams.get("token")
  if (provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  revalidateTag("handbook", "default")
  return NextResponse.json({ revalidated: true, tag: "handbook" })
}
