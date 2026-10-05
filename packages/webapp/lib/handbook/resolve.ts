import { notFound, permanentRedirect, redirect } from "next/navigation"

import { listEntityYears } from "../db/handbook.ts"
import { listAvailableYears } from "../db/queries.ts"
import { entityHref, type EntityKind } from "./links.ts"

export interface ResolvedEntity {
  code: string
  /** The year this page shows. */
  year: string
  /** Every year with a page for the code, oldest first. */
  years: string[]
  /** The code's latest year: what the bare URL shows. */
  latest: string
  /** The newest handbook year in the database. */
  siteLatest: string
  /** Year segment for links on this page; null on latest-year pages. */
  linkYear: string | null
  /** The canonical path: bare for the latest year, else with the year. */
  canonical: string
}

/**
 * Work out which year a handbook URL shows, and redirect URLs that
 * have a better form: a lowercase code goes to the uppercase one, and
 * a year without a page for the code goes to the code's latest page.
 * Unknown codes are a 404.
 */
export async function resolveEntity(
  kind: EntityKind,
  rawCode: string,
  rawYear: string | null
): Promise<ResolvedEntity> {
  const decoded = decodeURIComponent(rawCode)
  const code = decoded.toUpperCase()
  if (!/^[A-Z0-9-]{2,16}$/.test(code)) notFound()
  if (decoded !== code) permanentRedirect(entityHref(kind, code, rawYear))
  if (rawYear != null && !/^\d{4}$/.test(rawYear)) notFound()

  const [years, siteYears] = await Promise.all([
    listEntityYears(kind, code),
    listAvailableYears(),
  ])
  const latest = years.at(-1)
  if (!latest) notFound()
  if (rawYear != null && !years.includes(rawYear)) {
    redirect(entityHref(kind, code))
  }
  const year = rawYear ?? latest
  const isLatest = year === latest
  return {
    code,
    year,
    years,
    latest,
    siteLatest: siteYears.at(-1) ?? latest,
    linkYear: isLatest ? null : year,
    canonical: entityHref(kind, code, isLatest ? null : year),
  }
}

/** ISO 8601 duration for "3 Years" / "18 Months", for structured data. */
export function isoDuration(text: string | null): string | undefined {
  const m = text?.match(/([\d.]+)\s*(year|month|week)/i)
  if (!m) return undefined
  const unit = { year: "Y", month: "M", week: "W" }[
    m[2].toLowerCase() as "year" | "month" | "week"
  ]
  return `P${m[1]}${unit}`
}
