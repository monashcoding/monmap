import { revalidatePath } from "next/cache"

import { listEntityYears } from "../db/handbook.ts"
import { entityHref } from "../handbook/links.ts"
import type { ReviewKind } from "./axes.ts"

/**
 * Drop the cached HTML of every page that shows these entities'
 * reviews: the bare URL and each year's URL. The next visit renders
 * the page fresh. /search is rendered per request, so it needs nothing.
 */
export async function revalidateReviewPages(
  targets: readonly { kind: ReviewKind; code: string }[]
): Promise<void> {
  const seen = new Set<string>()
  for (const { kind, code } of targets) {
    const key = `${kind}:${code}`
    if (seen.has(key)) continue
    seen.add(key)
    revalidatePath(entityHref(kind, code))
    for (const year of await listEntityYears(kind, code)) {
      revalidatePath(entityHref(kind, code, year))
    }
  }
}
