import Link from "next/link"
import {
  ArrowUpRightIcon,
  ChevronRightIcon,
  type LucideIcon,
} from "lucide-react"

import { PageShell } from "@/components/page-shell"
import { HandbookAttribution } from "@/components/handbook-attribution"
import { RatingInline } from "@/components/reviews/stars"
import {
  ENTITY_LABEL,
  rewriteHandbookHtml,
  type EntityKind,
} from "@/lib/handbook/links"
import type { RatingSummary } from "@/lib/reviews/types"
import { cn } from "@/lib/utils"

import { MobileClamp } from "./mobile-clamp"
import { MobileToc, PageToc, type TocItem } from "./page-toc"
import { YearSelect } from "./year-select"

/**
 * The chrome every handbook page shares: the page frame, the hero,
 * sections and the small pieces inside them. No database imports, so
 * any component can use it.
 */

/* ------------------------------------------------------------------ *
 * Page frame
 * ------------------------------------------------------------------ */

export function HandbookMain({
  year,
  children,
}: {
  year: string
  children: React.ReactNode
}) {
  return (
    <PageShell>
      {children}
      <HandbookAttribution year={year} />
    </PageShell>
  )
}

export interface Crumb {
  label: string
  href?: string
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {items.map((c, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 ? <ChevronRightIcon className="size-3" aria-hidden /> : null}
            {c.href ? (
              <Link
                href={c.href}
                className="hover:text-foreground hover:underline"
              >
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-foreground">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

const KIND_BADGE: Record<EntityKind, string> = {
  unit: "bg-muted text-muted-foreground",
  course: "bg-primary/40 text-primary-foreground",
  aos: "bg-info-soft text-info-foreground",
}

export function KindBadge({
  kind,
  label,
  className,
}: {
  kind: EntityKind
  label?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-tag px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
        KIND_BADGE[kind],
        className
      )}
    >
      {label ?? ENTITY_LABEL[kind]}
    </span>
  )
}

export interface HeroStat {
  label: string
  value: string
  /** A second line, such as the campuses after "Semester 1". */
  hint?: string | null
}

/**
 * The top card of a handbook page: breadcrumbs, the code and title,
 * the year picker and the Monash Handbook link, then the facts most
 * people come for (credit points, when it runs, how it's assessed) as
 * a row of tiles.
 */
export function EntityHero({
  kind,
  kindLabel,
  code,
  title,
  facts,
  subtitle,
  lede,
  stats = [],
  breadcrumbs,
  year,
  years,
  yearHref,
  handbookUrl,
  rating,
  actions,
  notice,
}: {
  kind: EntityKind
  kindLabel?: string
  code: string
  title: string
  /** Short labels beside the kind badge, such as "Level 2". */
  facts: Array<string | null | undefined | false>
  subtitle?: string | null
  /** A summary in MonMap's words, under the title. */
  lede?: React.ReactNode
  /** Calls to action beside the rating, such as "Plan this course". */
  actions?: React.ReactNode
  stats?: Array<HeroStat | null | false>
  breadcrumbs: Crumb[]
  year: string
  years: string[]
  yearHref: (year: string) => string
  handbookUrl: string
  /** Shown under the title, linking to the Reviews section. */
  rating?: RatingSummary
  notice?: React.ReactNode
}) {
  const shown = facts.filter((f): f is string => !!f)
  const tiles = stats.filter((t): t is HeroStat => !!t)
  return (
    <header className="flex flex-col gap-5 rounded-panel border bg-card p-5 shadow-card sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumbs items={breadcrumbs} />
        <div className="flex flex-wrap items-center gap-3">
          <YearSelect
            value={year}
            options={[...years]
              .reverse()
              .map((y) => ({ year: y, href: yearHref(y) }))}
          />
          <a
            href={handbookUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-info-foreground underline-offset-2 hover:underline"
          >
            Monash Handbook
            <ArrowUpRightIcon className="size-3.5" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <KindBadge kind={kind} label={kindLabel} />
          {shown.map((f, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 ? <span aria-hidden>|</span> : null}
              {f}
            </span>
          ))}
        </div>
        <h1 className="text-3xl leading-tight font-semibold text-balance sm:text-4xl">
          <span className="text-muted-foreground tabular-nums">{code}</span>{" "}
          {title}
        </h1>
        {subtitle ? (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
        {rating || actions ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {rating ? (
              <a
                href="#reviews"
                className="rounded-tag underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RatingInline summary={rating} size="md" />
              </a>
            ) : null}
            {actions}
          </div>
        ) : null}
        {lede ? (
          <p className="max-w-3xl pt-1 text-[15px] leading-relaxed text-foreground/80">
            {lede}
          </p>
        ) : null}
      </div>

      {tiles.length > 0 ? (
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-control border bg-border sm:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
          {tiles.map((t) => (
            <div
              key={t.label}
              className="flex flex-col gap-0.5 bg-card px-4 py-3"
            >
              <dt className="text-xs text-muted-foreground">{t.label}</dt>
              <dd className="text-base leading-snug font-semibold">
                {t.value}
              </dd>
              {t.hint ? (
                <dd className="text-xs text-muted-foreground">{t.hint}</dd>
              ) : null}
            </div>
          ))}
        </dl>
      ) : null}
      {notice}
    </header>
  )
}

/** A yellow-tinted note under the hero, such as an older-year warning. */
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-control bg-primary/40 px-3.5 py-2.5 text-sm text-primary-foreground">
      {children}
    </p>
  )
}

/**
 * The sections of a page in one column, with "On this page" in a
 * sticky rail beside them on wide screens and as a sticky row of chips
 * above them on narrow ones.
 */
export function DetailLayout({
  toc,
  children,
}: {
  toc: Array<TocItem | null | false>
  children: React.ReactNode
}) {
  const items = toc.filter((t): t is TocItem => !!t)
  return (
    <div className="grid items-start gap-3 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_200px]">
      <div className="flex min-w-0 flex-col gap-3 sm:gap-5">
        <MobileToc items={items} className="lg:hidden" />
        {children}
      </div>
      <aside className="sticky top-[4.5rem] hidden lg:block">
        <PageToc items={items} />
      </aside>
    </div>
  )
}

export function Section({
  id,
  title,
  icon: Icon,
  action,
  clamp = false,
  children,
  className,
}: {
  id?: string
  title: string
  icon?: LucideIcon
  /** Something for the heading's right side, such as a count. */
  action?: React.ReactNode
  /** Cut long text short on phones, behind "Show more". */
  clamp?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={cn(
        // Below lg the chip row sticks under the header too, so a jump
        // to a section stops lower.
        "scroll-mt-28 rounded-panel border bg-card p-5 shadow-card sm:p-7 lg:scroll-mt-20",
        className
      )}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2
          id={id ? `${id}-title` : undefined}
          className="flex items-center gap-2.5 text-lg font-semibold"
        >
          {Icon ? (
            // MAC yellow tile with charcoal ink (CLAUDE.md section 4).
            <span className="flex size-8 items-center justify-center rounded-control bg-primary text-primary-foreground">
              <Icon className="size-4" strokeWidth={2.25} aria-hidden />
            </span>
          ) : null}
          {title}
        </h2>
        {action}
      </div>
      {clamp ? <MobileClamp>{children}</MobileClamp> : children}
    </section>
  )
}

/** A small heading inside a section. Callers space the blocks. */
export function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h3>
  )
}

/** Monash's HTML, with handbook links pointed at MonMap pages. */
export function Prose({
  html,
  linkYear,
  className,
}: {
  html: string | null | undefined
  linkYear: string | null
  className?: string
}) {
  if (!html) return null
  // data-nosnippet: this text is Monash's, also on handbook.monash.edu,
  // so search results should quote MonMap's own summary instead.
  return (
    <div
      data-nosnippet=""
      className={cn("handbook-prose", className)}
      dangerouslySetInnerHTML={{ __html: rewriteHandbookHtml(html, linkYear) }}
    />
  )
}

export function FactList({
  rows,
}: {
  rows: Array<{ label: string; value: React.ReactNode } | null | false>
}) {
  const shown = rows.filter(
    (r): r is { label: string; value: React.ReactNode } =>
      !!r && r.value != null
  )
  if (shown.length === 0) return null
  return (
    <dl className="flex flex-col text-sm">
      {shown.map((r, i) => (
        <div
          key={`${r.label}-${i}`}
          className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2 first:pt-0 last:border-b-0 last:pb-0"
        >
          <dt className="shrink-0 text-muted-foreground">{r.label}</dt>
          <dd className="min-w-0 text-right font-medium">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Links to the same entity in each handbook year. */
export function YearLinks({
  years,
  current,
  href,
}: {
  years: string[]
  current: string
  href: (year: string) => string
}) {
  return (
    <span className="flex flex-wrap justify-end gap-x-2 gap-y-1">
      {years.map((y) =>
        y === current ? (
          <span key={y} className="font-semibold">
            {y}
          </span>
        ) : (
          <Link
            key={y}
            href={href(y)}
            // Year pages are noindex; crawlers needn't spend time on
            // them. The latest year's link is the bare, indexed URL.
            rel={href(y).endsWith(`/${y}`) ? "nofollow" : undefined}
            className="font-normal text-info-foreground underline-offset-2 hover:underline"
          >
            {y}
          </Link>
        )
      )}
    </span>
  )
}
