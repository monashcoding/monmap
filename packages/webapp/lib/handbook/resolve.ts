import { notFound, permanentRedirect, redirect } from "next/navigation"

import { listEntityYears } from "../db/handbook.ts"
import { listAvailableYears } from "../db/queries.ts"
import {
  parseEntityUrl,
  planEntityPage,
  type EntityKind,
  type EntityRoute,
  type ResolvedEntity,
} from "./links.ts"

export type { ResolvedEntity } from "./links.ts"
export { isCurrent } from "./links.ts"

/** Act on a 404 or a redirect; return the rest. */
function follow<T>(route: EntityRoute<T>): T {
  if (route.action === "notFound") notFound()
  if (route.action === "redirect") {
    if (route.permanent) permanentRedirect(route.to)
    redirect(route.to)
  }
  return route
}

/**
 * Work out which year a handbook URL shows, and redirect URLs that
 * have a better form: a lowercase code goes to the uppercase one, and
 * a year without a page for the code goes to the code's latest page.
 * Unknown codes are a 404. The rules are in links.ts, where they are
 * tested; this only fetches the years and acts on the result.
 */
export async function resolveEntity(
  kind: EntityKind,
  rawCode: string,
  rawYear: string | null
): Promise<ResolvedEntity> {
  const { code } = follow(parseEntityUrl(kind, rawCode, rawYear))
  const [years, siteYears] = await Promise.all([
    listEntityYears(kind, code),
    listAvailableYears(),
  ])
  return follow(planEntityPage(kind, code, rawYear, years, siteYears)).entity
}
