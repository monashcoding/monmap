/**
 * URLs for the handbook pages: /units/[code], /courses/[code] and
 * /aos/[code], each with an optional /[year] segment. The bare URL
 * shows the entity's latest handbook year and is the canonical one;
 * the year segment pins an earlier year.
 *
 * The segment names copy handbook.monash.edu, so swapping the domain
 * on a Monash link gives the matching MonMap page.
 */

import { sanitizeHandbookHtml } from "./sanitize.ts"

export type EntityKind = "unit" | "course" | "aos"

export const ENTITY_SEGMENT: Record<EntityKind, string> = {
  unit: "units",
  course: "courses",
  aos: "aos",
}

export const ENTITY_LABEL: Record<EntityKind, string> = {
  unit: "Unit",
  course: "Course",
  aos: "Area of study",
}

/**
 * The page for one entity. Pass `year` only when the link must stay in
 * that handbook year; a null year links the latest version.
 */
export function entityHref(
  kind: EntityKind,
  code: string,
  year?: string | null
): string {
  const base = `/${ENTITY_SEGMENT[kind]}/${encodeURIComponent(code.toUpperCase())}`
  return year ? `${base}/${year}` : base
}

/**
 * The planner, opened on this course and year. app/page.tsx reads the
 * `course` and `year` params back.
 */
export function planCourseHref(code: string, year: string): string {
  return `/?course=${encodeURIComponent(code)}&year=${year}`
}

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
  /**
   * The canonical path: always the bare URL. Year pages repeat the
   * same unit with small changes, so they point search engines at the
   * bare page, which collects their links and is the one indexed.
   */
  canonical: string
  /**
   * Whether the code should be in search results at all. Codes gone
   * from the two newest handbooks are retired: their pages stay up but
   * are noindex, follow.
   */
  indexable: boolean
}

/** What a handbook URL does: 404, redirect, or go on. */
export type EntityRoute<T> =
  | { action: "notFound" }
  | { action: "redirect"; permanent: boolean; to: string }
  | ({ action: "ok" } & T)

/** A code is current if it is in either of the two newest handbooks. */
export function isCurrent(latest: string, siteLatest: string): boolean {
  return Number(latest) >= Number(siteLatest) - 1
}

/**
 * `raw` upper-cased, or null when it can't be a unit, course or area of
 * study code. One combined course is coded "M6011 M6019", so a single
 * space between two parts is allowed. Handbook URLs, the review actions
 * and the share cards all check codes with this.
 */
export function normaliseEntityCode(raw: string): string | null {
  const code = raw.toUpperCase()
  return /^[A-Z0-9-]{2,16}(?: [A-Z0-9-]{2,16})?$/.test(code) ? code : null
}

/**
 * The code a handbook URL names. Next.js has decoded the segment once
 * already; a second decode turns `%2520` style double-encoding into the
 * code, and a malformed escape is a 404, not an error. A lowercase code
 * redirects to the uppercase one.
 */
export function parseEntityUrl(
  kind: EntityKind,
  rawCode: string,
  rawYear: string | null
): EntityRoute<{ code: string }> {
  let decoded: string
  try {
    decoded = decodeURIComponent(rawCode)
  } catch {
    return { action: "notFound" }
  }
  const code = normaliseEntityCode(decoded)
  if (!code) return { action: "notFound" }
  if (decoded !== code)
    return {
      action: "redirect",
      permanent: true,
      to: entityHref(kind, code, rawYear),
    }
  if (rawYear != null && !/^\d{4}$/.test(rawYear)) return { action: "notFound" }
  return { action: "ok", code }
}

/**
 * The page for `code` once its years are known. An unknown code is a
 * 404, and a year without a page for the code redirects to the bare
 * URL, which shows the latest year.
 */
export function planEntityPage(
  kind: EntityKind,
  code: string,
  rawYear: string | null,
  years: string[],
  siteYears: string[]
): EntityRoute<{ entity: ResolvedEntity }> {
  const latest = years.at(-1)
  if (!latest) return { action: "notFound" }
  if (rawYear != null && !years.includes(rawYear))
    return { action: "redirect", permanent: false, to: entityHref(kind, code) }
  const year = rawYear ?? latest
  const siteLatest = siteYears.at(-1) ?? latest
  return {
    action: "ok",
    entity: {
      code,
      year,
      years,
      latest,
      siteLatest,
      linkYear: year === latest ? null : year,
      canonical: entityHref(kind, code),
      indexable: isCurrent(latest, siteLatest),
    },
  }
}

/** The same entity's page on handbook.monash.edu. */
export function monashHandbookUrl(
  kind: EntityKind,
  code: string,
  year: string
): string {
  return `https://handbook.monash.edu/${year}/${ENTITY_SEGMENT[kind]}/${code}`
}

const SEGMENT_KIND: Record<string, EntityKind> = {
  units: "unit",
  courses: "course",
  aos: "aos",
}

// handbook.monash.edu/2026/units/FIT1008, or the path alone
// (/2026/units/FIT1008), which is how curriculum leaves store it.
const HANDBOOK_PATH =
  /^(?:https?:\/\/handbook\.monash\.edu)?\/(?:current|\d{4})\/(units|courses|aos)\/([A-Za-z0-9]+)\/?(?:[?#].*)?$/i
// The legacy host: www.monash.edu/pubs/2019handbooks/units/MTH1030.html
const LEGACY_PATH =
  /^https?:\/\/(?:www\.)?monash\.edu(?:\.au)?\/pubs\/[^/]*handbooks?\/(units|courses|aos)\/([A-Za-z0-9]+)\.html/i

/**
 * The MonMap page for a handbook link, or null when the link is not a
 * unit, course or area of study page. Monash freezes cross-references
 * at the year they were approved (a 2026 unit links /2021/units/FIT1008),
 * so the link's own year is dropped and `linkYear` is used instead.
 */
export function handbookLinkToHref(
  url: string,
  linkYear: string | null
): string | null {
  const m = url.trim().match(HANDBOOK_PATH) ?? url.trim().match(LEGACY_PATH)
  if (!m) return null
  const kind = SEGMENT_KIND[m[1].toLowerCase()]
  return kind ? entityHref(kind, m[2], linkYear) : null
}

/**
 * Sanitize Monash's HTML prose (see sanitize.ts) and point its handbook
 * links at MonMap pages, so a prerequisite named in an enrolment rule
 * opens its MonMap page. Other web links open in a new tab. Running it
 * twice gives the same output, so HTML the server already cleaned can
 * go through it again.
 */
export function rewriteHandbookHtml(
  html: string | null | undefined,
  linkYear: string | null
): string {
  // After sanitizing, every link is exactly `<a>` or `<a href="...">`
  // with an escaped, allowlisted href.
  return sanitizeHandbookHtml(html).replace(
    /<a href="([^"]*)">/g,
    (tag, escaped: string) => {
      const url = escaped.replace(/&amp;/g, "&")
      const internal = handbookLinkToHref(url, linkYear)
      if (internal) return `<a href="${internal}">`
      if (!/^https?:/i.test(url)) return tag
      return `<a href="${escaped}" target="_blank" rel="noopener noreferrer">`
    }
  )
}
