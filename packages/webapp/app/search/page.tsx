import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
} from "lucide-react"

import { EntityLink } from "@/components/handbook/entity-link"
import { HandbookMain, KindBadge } from "@/components/handbook/frame"
import { JsonLd } from "@/components/handbook/json-ld"
import { MobileCollapsible } from "@/components/handbook/mobile-collapsible"
import { loadRatings, ratingKey } from "@/components/handbook/ratings"
import { SearchBox } from "@/components/handbook/search-box"
import { YearSelect } from "@/components/handbook/year-select"
import { RatingInline } from "@/components/reviews/stars"
import {
  listSearchFacets,
  SEARCH_PAGE_SIZE,
  searchHandbook,
  type SearchHit,
} from "@/lib/db/handbook"
import { listAvailableYears } from "@/lib/db/queries"
import { entityHref, type EntityKind } from "@/lib/handbook/links"
import {
  FILTER_PERIODS,
  parseSearchState,
  searchHref,
  searchParamsOf,
  STUDY_LEVELS,
  type SearchState,
  type SearchTab,
} from "@/lib/handbook/search-url"
import { PERIOD_KIND_LABEL } from "@/lib/planner/teaching-period"
import type { RatingSummary } from "@/lib/reviews/types"
import { absoluteUrl } from "@/lib/seo"
import { cn } from "@/lib/utils"

type Params = Promise<Record<string, string | string[] | undefined>>

const DESCRIPTION =
  "Search every Monash University unit, course, major, minor and specialisation by code, title or topic. See prerequisites, offerings, course structures and requisite maps for each."

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Params
}): Promise<Metadata> {
  const sp = await searchParams
  const q = typeof sp.q === "string" ? sp.q.trim() : ""
  // Only the bare page is indexed; queries, tabs, filters and pages
  // are crawled for their links but kept out of the index.
  const bare = Object.keys(sp).length === 0
  return {
    title: q ? `Search results for ${q}` : "Search Units & Courses",
    description: DESCRIPTION,
    alternates: { canonical: "/search" },
    robots: bare ? undefined : { index: false, follow: true },
    openGraph: {
      title: "Search Monash Units & Courses",
      description: DESCRIPTION,
      type: "website",
      url: "/search",
    },
    twitter: {
      card: "summary_large_image",
      title: "Search Monash Units & Courses",
      description: DESCRIPTION,
    },
  }
}

const TAB_LABEL: Record<SearchTab, string> = {
  all: "All",
  courses: "Courses",
  aos: "Areas of study",
  units: "Units",
}

const TAB_KIND: Record<Exclude<SearchTab, "all">, EntityKind> = {
  courses: "course",
  aos: "aos",
  units: "unit",
}

/**
 * /search: one box over every unit, course and area of study in a
 * handbook year, with tabs, filters and pages. Results render on the
 * server from the query string; the box updates the URL as you type.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Params
}) {
  const sp = await searchParams

  // /search?unit=, ?course= and ?aos= were the old search screen's links.
  const legacyYear = typeof sp.year === "string" ? sp.year : null
  for (const [param, kind] of [
    ["unit", "unit"],
    ["course", "course"],
    ["aos", "aos"],
  ] as const) {
    const code = sp[param]
    if (typeof code === "string" && code.trim()) {
      redirect(entityHref(kind, code.trim(), legacyYear))
    }
  }

  const years = await listAvailableYears()
  const latest = years.at(-1) ?? String(new Date().getFullYear())
  const state = parseSearchState(sp, years)
  const year = state.year ?? latest

  const [result, facets] = await Promise.all([
    searchHandbook({
      q: state.q,
      tab: state.tab,
      year,
      faculty: state.faculty,
      study: state.study,
      level: state.level,
      period: state.period,
      campus: state.campus,
      page: state.page,
    }),
    listSearchFacets(year),
  ])

  // Ratings are live (this page renders per request), one query a kind.
  const ratings = await loadRatings(result.hits)

  const pageCount = Math.max(1, Math.ceil(result.total / SEARCH_PAGE_SIZE))
  const base = searchParamsOf({ ...state, q: "", page: 1 }).toString()
  const words = state.q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1)
  const activeFilters: Array<{ label: string; clear: Partial<SearchState> }> =
    []
  if (state.study)
    activeFilters.push({ label: state.study, clear: { study: null } })
  if (state.faculty)
    activeFilters.push({
      label: state.faculty.replace(/^Faculty of /, ""),
      clear: { faculty: null },
    })
  if (state.level)
    activeFilters.push({
      label: `Level ${state.level}`,
      clear: { level: null },
    })
  if (state.period)
    activeFilters.push({
      label: PERIOD_KIND_LABEL[state.period],
      clear: { period: null },
    })
  if (state.campus)
    activeFilters.push({ label: state.campus, clear: { campus: null } })

  return (
    <HandbookMain year={year}>
      <section className="flex flex-col gap-5 rounded-panel border bg-card px-5 pt-6 shadow-card sm:px-7 sm:pt-8">
        <div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="text-2xl font-semibold sm:text-3xl">
              Search units &amp; courses
            </h1>
            <YearSelect
              value={year}
              options={[...years].reverse().map((y) => ({
                year: y,
                href: searchHref(state, { year: y === latest ? null : y }),
              }))}
            />
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every unit, course, major, minor and specialisation in the Monash
            handbook, with requisite maps and course structures.
          </p>
        </div>
        <SearchBox
          query={state.q}
          baseParams={base}
          exact={
            result.exact
              ? {
                  code: result.exact.code,
                  href: entityHref(
                    result.exact.kind,
                    result.exact.code,
                    state.year
                  ),
                }
              : null
          }
        />
        <nav
          aria-label="Result types"
          className="-mb-px flex gap-1 overflow-x-auto"
        >
          {(["all", "courses", "aos", "units"] as const).map((tab) => {
            const count =
              tab === "all"
                ? result.counts.course + result.counts.aos + result.counts.unit
                : result.counts[TAB_KIND[tab]]
            const active = state.tab === tab
            return (
              <Link
                key={tab}
                href={searchHref(state, { tab })}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 border-b-2 px-3 pb-3 text-sm whitespace-nowrap",
                  active
                    ? "border-emphasis font-semibold text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {TAB_LABEL[tab]}
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
                  {count.toLocaleString("en-AU")}
                </span>
              </Link>
            )
          })}
        </nav>
      </section>

      <div className="grid items-start gap-3 sm:gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* On wide screens the filters stay in view while the results
            scroll, below the sticky header; they scroll on their own if
            taller than the window. */}
        <MobileCollapsible
          label="Filters"
          badge={activeFilters.length}
          className="lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100svh-5.5rem)] lg:overflow-y-auto lg:rounded-panel"
        >
          <Filters state={state} facets={facets} />
        </MobileCollapsible>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground" aria-live="polite">
              {result.total.toLocaleString("en-AU")} result
              {result.total === 1 ? "" : "s"}
              {state.q ? (
                <>
                  {" "}
                  for{" "}
                  <span className="font-medium text-foreground">
                    &ldquo;{state.q}&rdquo;
                  </span>
                </>
              ) : null}{" "}
              in the {year} handbook
            </span>
            {activeFilters.map((f) => (
              <Link
                key={f.label}
                href={searchHref(state, f.clear)}
                scroll={false}
                rel="nofollow"
                className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-0.5 text-xs hover:border-ring"
              >
                {f.label}
                <XIcon className="size-3" aria-label="Remove filter" />
              </Link>
            ))}
          </div>

          {result.elsewhere ? (
            <p className="rounded-control bg-primary/40 px-4 py-3 text-sm text-primary-foreground">
              {result.elsewhere.code} is not in the {year} handbook. Its latest
              entry is from {result.elsewhere.year}:{" "}
              <Link
                href={entityHref(result.elsewhere.kind, result.elsewhere.code)}
                className="font-semibold underline"
              >
                open {result.elsewhere.code}
              </Link>
              .
            </p>
          ) : null}

          {result.hits.length > 0 ? (
            <ol className="flex flex-col divide-y overflow-hidden rounded-panel border bg-card shadow-card">
              {result.hits.map((h) => (
                <li key={`${h.kind}:${h.code}`}>
                  <Hit
                    hit={h}
                    words={words}
                    linkYear={state.year}
                    rating={ratings.get(ratingKey(h.kind, h.code))}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <div className="rounded-panel border bg-card px-5 py-10 text-center shadow-card">
              <p className="font-medium">No results</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a shorter search
                {activeFilters.length > 0 ? ", remove a filter" : ""}
                {state.tab !== "all" ? " or search all types" : ""}.
              </p>
            </div>
          )}

          {pageCount > 1 ? (
            <Pagination state={state} pageCount={pageCount} />
          ) : null}
        </div>
      </div>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "MonMap",
          url: absoluteUrl("/"),
          potentialAction: {
            "@type": "SearchAction",
            target: {
              "@type": "EntryPoint",
              urlTemplate: `${absoluteUrl("/search")}?q={search_term_string}`,
            },
            "query-input": "required name=search_term_string",
          },
        }}
      />
    </HandbookMain>
  )
}

/** Wrap the query's words in <mark> inside `text`. */
function highlight(text: string, words: string[]): React.ReactNode {
  if (words.length === 0) return text
  const re = new RegExp(
    `(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi"
  )
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <mark
        key={i}
        className="rounded-sm bg-primary/40 px-0.5 text-primary-foreground"
      >
        {part}
      </mark>
    ) : (
      part
    )
  )
}

function Hit({
  hit,
  words,
  linkYear,
  rating,
}: {
  hit: SearchHit
  words: string[]
  linkYear: string | null
  rating: RatingSummary | undefined
}) {
  const facts = [
    hit.detail,
    hit.kind === "unit" ? null : hit.studyLevel,
    hit.creditPoints ? `${hit.creditPoints} credit points` : null,
    hit.school?.replace(/^Faculty of /, ""),
  ].filter(Boolean)
  const periods = hit.periods.filter((p) => p !== "OTHER")
  return (
    <EntityLink
      href={entityHref(hit.kind, hit.code, linkYear)}
      className="group flex items-center gap-3 px-4 py-4 hover:bg-muted/40 sm:px-5"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-semibold tabular-nums">
            {highlight(hit.code, words)}
          </span>
          <span className="font-medium underline-offset-2 group-hover:underline">
            {highlight(hit.title, words)}
          </span>
        </p>
        <RatingInline summary={rating} size="sm" />
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <KindBadge kind={hit.kind} />
          {facts.map((f, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 ? <span aria-hidden>|</span> : null}
              {f}
            </span>
          ))}
        </p>
        {hit.snippet ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {hit.snippet}
          </p>
        ) : null}
        {periods.length > 0 || hit.campuses.length > 0 ? (
          <p className="flex flex-wrap gap-1.5 pt-0.5">
            {periods.map((p) => (
              <span
                key={p}
                className="rounded-tag bg-info-soft px-1.5 py-0.5 text-[11px] font-medium text-info-foreground"
              >
                {PERIOD_KIND_LABEL[p]}
              </span>
            ))}
            {hit.campuses.slice(0, 5).map((c) => (
              <span
                key={c}
                className="rounded-tag bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {c}
              </span>
            ))}
            {hit.campuses.length > 5 ? (
              <span className="px-1 text-[11px] text-muted-foreground">
                +{hit.campuses.length - 5} more
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
      <ChevronRightIcon
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
    </EntityLink>
  )
}

function Filters({
  state,
  facets,
}: {
  state: SearchState
  facets: { faculties: string[]; campuses: string[]; levels: string[] }
}) {
  const units = state.tab === "units"
  const studyOptions = units
    ? STUDY_LEVELS.filter((s) => s === "Undergraduate" || s === "Postgraduate")
    : STUDY_LEVELS
  return (
    <div className="flex flex-col gap-5 rounded-panel border bg-card p-4 shadow-card">
      <FilterGroup
        title="Study level"
        options={studyOptions.map((s) => ({
          label: s,
          active: state.study === s,
          href: searchHref(state, { study: state.study === s ? null : s }),
        }))}
      />
      {units ? (
        <>
          <FilterGroup
            title="Teaching period"
            options={FILTER_PERIODS.map((p) => ({
              label: PERIOD_KIND_LABEL[p],
              active: state.period === p,
              href: searchHref(state, {
                period: state.period === p ? null : p,
              }),
            }))}
          />
          <FilterGroup
            title="Level"
            columns
            options={facets.levels.map((l) => ({
              label: `Level ${l}`,
              active: state.level === l,
              href: searchHref(state, { level: state.level === l ? null : l }),
            }))}
          />
          <FilterGroup
            title="Campus"
            options={facets.campuses.map((c) => ({
              label: c,
              active: state.campus === c,
              href: searchHref(state, {
                campus: state.campus === c ? null : c,
              }),
            }))}
          />
        </>
      ) : (
        <p className="-mt-2 text-xs text-muted-foreground">
          Pick the Units tab to filter by teaching period, level and campus.
        </p>
      )}
      <FilterGroup
        title="Faculty"
        options={facets.faculties.map((f) => ({
          label: f.replace(/^Faculty of /, ""),
          active: state.faculty === f,
          href: searchHref(state, { faculty: state.faculty === f ? null : f }),
        }))}
      />
    </div>
  )
}

function FilterGroup({
  title,
  options,
  columns = false,
}: {
  title: string
  options: Array<{ label: string; active: boolean; href: string }>
  columns?: boolean
}) {
  if (options.length === 0) return null
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </legend>
      <ul
        className={cn("flex flex-col gap-0.5", columns && "grid grid-cols-2")}
      >
        {options.map((o) => (
          <li key={o.label}>
            <Link
              href={o.href}
              scroll={false}
              rel="nofollow"
              aria-current={o.active ? "true" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-control px-2 py-1.5 text-sm hover:bg-muted",
                o.active && "font-medium"
              )}
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-tag border border-input bg-field",
                  o.active && "border-emphasis bg-emphasis text-card"
                )}
                aria-hidden
              >
                {o.active ? <CheckIcon className="size-3" /> : null}
              </span>
              {o.label}
            </Link>
          </li>
        ))}
      </ul>
    </fieldset>
  )
}

function Pagination({
  state,
  pageCount,
}: {
  state: SearchState
  pageCount: number
}) {
  const current = state.page
  const pages = new Set<number>([1, pageCount])
  for (let p = current - 2; p <= current + 2; p++)
    if (p > 1 && p < pageCount) pages.add(p)
  const sorted = [...pages].sort((a, b) => a - b)
  const href = (p: number) => searchHref(state, { page: p })
  const btn =
    "inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-control border bg-card px-3 text-sm hover:border-ring"
  return (
    <nav
      aria-label="Pages"
      className="flex flex-wrap items-center justify-center gap-1.5 pt-2"
    >
      {current > 1 ? (
        <Link href={href(current - 1)} rel="prev" className={btn}>
          <ChevronLeftIcon className="size-4" />
          Previous
        </Link>
      ) : null}
      {sorted.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && p - sorted[i - 1] > 1 ? (
            <span className="px-1 text-muted-foreground" aria-hidden>
              ...
            </span>
          ) : null}
          {p === current ? (
            <span
              aria-current="page"
              className={cn(btn, "border-emphasis font-semibold")}
            >
              {p}
            </span>
          ) : (
            <Link href={href(p)} className={btn}>
              {p}
            </Link>
          )}
        </span>
      ))}
      {current < pageCount ? (
        <Link href={href(current + 1)} rel="next" className={btn}>
          Next
          <ChevronRightIcon className="size-4" />
        </Link>
      ) : null}
    </nav>
  )
}
