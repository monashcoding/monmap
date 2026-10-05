import { revalidatePath } from "next/cache"

import { listEntityYears } from "../db/handbook.ts"
import { entityHref } from "../handbook/links.ts"
import type { ReviewKind } from "./axes.ts"

/**
 * Drop the cached HTML of every page that shows these entities'
 * reviews: the bare URL, each year's URL and the hub that lists the
 * entity's rating. The next visit renders the page fresh. /search is
 * rendered per request, so it needs nothing.
 */
export async function revalidateReviewPages(
  targets: readonly { kind: ReviewKind; code: string }[]
): Promise<void> {
  const seen = new Set<string>()
  const hubs = new Set<string>()
  for (const { kind, code } of targets) {
    const key = `${kind}:${code}`
    if (seen.has(key)) continue
    seen.add(key)
    revalidatePath(entityHref(kind, code))
    for (const year of await listEntityYears(kind, code)) {
      revalidatePath(entityHref(kind, code, year))
    }
    // next.config.mjs rewrites /courses and /aos to these paths, and
    // the ISR entry is stored under the rewritten path.
    if (kind === "course") hubs.add("/hubs/courses")
    if (kind === "aos") hubs.add("/hubs/aos")
  }
  for (const hub of hubs) revalidatePath(hub)
}
