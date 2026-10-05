/**
 * What the unit, course and area of study pages share around their
 * content: metadata, year links, the older-year notice and the
 * breadcrumbs with their structured data.
 *
 * The route files under app/{units,courses,aos}/[code] render on first
 * visit and are cached as static HTML for a day (ISR). A new or
 * moderated review drops the reviewed page's copy at once; the day
 * bounds how stale the stars on other pages' lists get. The build
 * renders none of them: it has no database, and rendering every code
 * would take far too long. See docs/handbook-pages.md for how to warm
 * the cache after a deploy.
 */
import type { Metadata } from "next"

import { breadcrumbLd } from "@/lib/handbook/json-ld"
import { entityHref, type EntityKind } from "@/lib/handbook/links"
import type { ResolvedEntity } from "@/lib/handbook/resolve"

import { type Crumb, Notice } from "./frame"

/** " (2025 handbook)" in a year page's title; nothing on the bare URL. */
export function yearNote(r: ResolvedEntity): string {
  return r.linkYear ? ` (${r.year} handbook)` : ""
}

/**
 * The metadata of an entity page. Year pages point their canonical at
 * the bare URL, and retired codes are noindex. `page` is null when the
 * code has no page in the resolved year.
 */
export function entityMetadata(
  r: ResolvedEntity,
  page: { title: string; description: string } | null
): Metadata {
  if (!page) return { title: r.code, robots: { index: false } }
  const { title, description } = page
  return {
    title,
    description,
    alternates: { canonical: r.canonical },
    robots: r.indexable ? undefined : { index: false, follow: true },
    openGraph: { title, description, type: "article", url: r.canonical },
    twitter: { card: "summary_large_image", title, description },
  }
}

/** The link for each handbook year; the latest year is the bare URL. */
export function entityYearHref(
  kind: EntityKind,
  code: string,
  r: ResolvedEntity
): (year: string) => string {
  return (y) => entityHref(kind, code, y === r.latest ? null : y)
}

/** Says when the page shows an older or a retired entry, else nothing. */
export function YearNotice({
  kind,
  code,
  r,
}: {
  kind: EntityKind
  code: string
  r: ResolvedEntity
}) {
  if (r.year !== r.latest) {
    return (
      <Notice>
        This is the {r.year} handbook entry.{" "}
        <a href={entityHref(kind, code)} className="font-semibold underline">
          See the {r.latest} entry
        </a>
        .
      </Notice>
    )
  }
  if (r.year !== r.siteLatest) {
    return (
      <Notice>
        The {r.siteLatest} handbook has no page for {code}. This is its {r.year}{" "}
        entry, the latest one.
      </Notice>
    )
  }
  return null
}

export interface TrailCrumb {
  label: string
  href: string
  /**
   * The path in structured data, when it differs from `href`; null
   * leaves the crumb out. Filtered /search URLs are noindex, so the
   * structured data points at the bare /search, which is indexed,
   * while the visible link keeps its filter.
   */
  ldPath?: string | null
}

/**
 * The hero's breadcrumbs and their BreadcrumbList, from one trail. The
 * hero ends on the code; the structured data ends on the page's full
 * name and canonical URL.
 */
export function entityCrumbs(
  trail: TrailCrumb[],
  page: { code: string; name: string; canonical: string }
): { crumbs: Crumb[]; ld: ReturnType<typeof breadcrumbLd> } {
  return {
    crumbs: [
      ...trail.map(({ label, href }) => ({ label, href })),
      { label: page.code },
    ],
    ld: breadcrumbLd([
      ...trail
        .filter((c) => c.ldPath !== null)
        .map((c) => ({ name: c.label, path: c.ldPath ?? c.href })),
      { name: page.name, path: page.canonical },
    ]),
  }
}
