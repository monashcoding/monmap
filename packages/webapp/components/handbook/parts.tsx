import Link from "next/link"
import {
  ArrowUpRightIcon,
  ChevronRightIcon,
  type LucideIcon,
} from "lucide-react"

import { AppHeader } from "@/components/app-header"
import { HandbookAttribution } from "@/components/handbook-attribution"
import type { CurriculumNode } from "@/lib/handbook/curriculum-tree"
import {
  ENTITY_LABEL,
  entityHref,
  rewriteHandbookHtml,
  type EntityKind,
} from "@/lib/handbook/links"
import type { RequisiteBlock, RequisiteContainer } from "@/lib/planner/types"
import { RatingInline } from "@/components/reviews/stars"
import { type RatingSummary, ratingSummaries } from "@/lib/db/reviews"
import { cn } from "@/lib/utils"

import { PageToc, type TocItem } from "./page-toc"
import { YearSelect } from "./year-select"

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
    <main className="mx-auto flex min-h-svh max-w-[1500px] flex-col gap-3 px-3 pt-3 pb-12 sm:gap-5 sm:px-5 sm:pt-5">
      <AppHeader />
      {children}
      <HandbookAttribution year={year} />
    </main>
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
  stats = [],
  breadcrumbs,
  year,
  years,
  yearHref,
  handbookUrl,
  rating,
  notice,
}: {
  kind: EntityKind
  kindLabel?: string
  code: string
  title: string
  /** Short labels beside the kind badge, such as "Level 2". */
  facts: Array<string | null | undefined | false>
  subtitle?: string | null
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
        {rating ? (
          <a
            href="#reviews"
            className="self-start rounded-tag underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RatingInline summary={rating} size="md" />
          </a>
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
 * sticky rail beside them on wide screens.
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
      <div className="flex min-w-0 flex-col gap-3 sm:gap-5">{children}</div>
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
  children,
  className,
}: {
  id?: string
  title: string
  icon?: LucideIcon
  /** Something for the heading's right side, such as a count. */
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={cn(
        "scroll-mt-20 rounded-panel border bg-card p-5 shadow-card sm:p-7",
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
      {children}
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
  return (
    <div
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
            className="font-normal text-info-foreground underline-offset-2 hover:underline"
          >
            {y}
          </Link>
        )
      )}
    </span>
  )
}

/* ------------------------------------------------------------------ *
 * Entity links and lists
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Ratings on lists
 * ------------------------------------------------------------------ */

/** Overall ratings keyed by `kind:code`. */
type Ratings = ReadonlyMap<string, RatingSummary>

const ratingKey = (kind: EntityKind, code: string) => `${kind}:${code}`

/** One query per kind for every row in a list or tree. */
async function loadRatings(
  items: ReadonlyArray<{ kind: EntityKind; code: string }>
): Promise<Ratings> {
  const byKind = new Map<EntityKind, string[]>()
  for (const it of items) {
    byKind.set(it.kind, [...(byKind.get(it.kind) ?? []), it.code])
  }
  const out = new Map<string, RatingSummary>()
  await Promise.all(
    [...byKind].map(async ([kind, codes]) => {
      const found = await ratingSummaries(kind, codes)
      for (const code of codes) {
        out.set(ratingKey(kind, code), found[code] ?? NO_RATING)
      }
    })
  )
  return out
}

const NO_RATING: RatingSummary = { average: null, count: 0 }

export interface EntityRowData {
  kind: EntityKind
  code: string
  title: string | null
  /** Right-hand note, such as "6 cp" or "Major". */
  note?: string | null
  /** False when MonMap has no page for the code. */
  linkable?: boolean
  /** Show the kind badge, for lists that mix units with other kinds. */
  showKind?: boolean
}

/**
 * A compact list: code, title, rating and a note per row. Pass
 * `ratings` when a parent already loaded them for many lists.
 */
export async function EntityRows({
  rows,
  linkYear,
  className,
  ratings,
}: {
  rows: EntityRowData[]
  linkYear: string | null
  className?: string
  ratings?: Ratings
}) {
  if (rows.length === 0) return null
  const loaded = ratings ?? (await loadRatings(rows))
  return (
    <ul
      className={cn("flex flex-col divide-y rounded-control border", className)}
    >
      {rows.map((r, i) => (
        <li key={`${r.kind}:${r.code}:${i}`}>
          <EntityRow
            row={r}
            linkYear={linkYear}
            rating={loaded.get(ratingKey(r.kind, r.code))}
          />
        </li>
      ))}
    </ul>
  )
}

function EntityRow({
  row,
  linkYear,
  rating,
}: {
  row: EntityRowData
  linkYear: string | null
  rating: RatingSummary | undefined
}) {
  const body = (
    <>
      <span className="font-semibold whitespace-nowrap tabular-nums">
        {row.code}
      </span>
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        {row.showKind && row.kind !== "unit" ? (
          <KindBadge kind={row.kind} className="translate-y-[-1px]" />
        ) : null}
        <span className="text-foreground/80 underline-offset-2 group-hover:underline">
          {row.title ?? ""}
        </span>
      </span>
      <span className="flex items-center justify-end gap-3 text-xs whitespace-nowrap text-muted-foreground">
        {row.linkable !== false ? (
          <RatingInline summary={rating} size="xs" />
        ) : null}
        {row.note ? <span>{row.note}</span> : null}
      </span>
    </>
  )
  const cls =
    "grid grid-cols-[minmax(4.5rem,auto)_minmax(0,1fr)_auto] items-baseline gap-x-3 px-3 py-2 text-sm"
  if (row.linkable === false) {
    return <div className={cls}>{body}</div>
  }
  return (
    <Link
      href={entityHref(row.kind, row.code, linkYear)}
      className={cn(cls, "group hover:bg-muted/50")}
    >
      {body}
    </Link>
  )
}

/**
 * Cards for a short list of courses or areas of study: the title
 * leads, the code and a note sit above it.
 */
export async function EntityCards({
  rows,
  linkYear,
}: {
  rows: EntityRowData[]
  linkYear: string | null
}) {
  if (rows.length === 0) return null
  const ratings = await loadRatings(rows)
  return (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r, i) => (
        <li key={`${r.kind}:${r.code}:${i}`} className="flex">
          <Link
            href={entityHref(r.kind, r.code, linkYear)}
            className="group flex w-full flex-col gap-1 rounded-control border px-3.5 py-3 hover:border-ring hover:bg-muted/30"
          >
            <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-semibold tabular-nums">{r.code}</span>
              {r.note ? <span>{r.note}</span> : null}
            </span>
            <span className="text-sm leading-snug font-medium underline-offset-2 group-hover:underline">
              {r.title ?? r.code}
            </span>
            <RatingInline
              summary={ratings.get(ratingKey(r.kind, r.code))}
              size="xs"
              className="mt-auto pt-1"
            />
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Unit tiles in a grid: code over title, for requisite groups. */
export async function UnitTiles({
  units,
  linkYear,
  ratings,
}: {
  units: Array<{ code: string; title: string | null; linkable: boolean }>
  linkYear: string | null
  ratings?: Ratings
}) {
  const loaded =
    ratings ??
    (await loadRatings(units.map((u) => ({ kind: "unit", code: u.code }))))
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {units.map((u) => {
        const body = (
          <>
            <span className="text-sm font-semibold tabular-nums">{u.code}</span>
            <span className="text-sm leading-snug text-muted-foreground group-hover:text-foreground">
              {u.title ?? "No handbook page"}
            </span>
            {u.linkable ? (
              <RatingInline
                summary={loaded.get(ratingKey("unit", u.code))}
                size="xs"
                className="pt-0.5"
              />
            ) : null}
          </>
        )
        const cls =
          "flex h-full flex-col gap-0.5 rounded-control border bg-card px-3.5 py-2.5"
        return (
          <li key={u.code}>
            {u.linkable ? (
              <Link
                href={entityHref("unit", u.code, linkYear)}
                className={cn(cls, "group hover:border-ring")}
              >
                {body}
              </Link>
            ) : (
              <div className={cn(cls, "border-dashed")}>{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/* ------------------------------------------------------------------ *
 * Curriculum structure
 * ------------------------------------------------------------------ */

function cp(n: number | null): string | null {
  return n ? `${n} credit points` : null
}

/**
 * A course or area of study structure as the handbook lays it out:
 * each part with its credit points and rule, then its units and areas
 * of study as links. Top-level parts collapse with <details>, which
 * keeps every link in the HTML for search engines.
 */
export async function CurriculumTree({
  nodes,
  linkYear,
  linkableUnits,
}: {
  nodes: CurriculumNode[]
  linkYear: string | null
  linkableUnits: ReadonlySet<string>
}) {
  const items: Array<{ kind: EntityKind; code: string }> = []
  const collect = (list: CurriculumNode[]) => {
    for (const n of list) {
      if (n.kind === "item") {
        if (n.entity) items.push({ kind: n.entity, code: n.code })
      } else collect(n.children)
    }
  }
  collect(nodes)
  const ratings = await loadRatings(items)
  return (
    <div className="flex flex-col gap-3">
      {nodes.map((n, i) =>
        n.kind === "group" ? (
          <details key={i} open className="group rounded-control border">
            <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="flex items-baseline gap-2 text-sm font-semibold">
                <ChevronRightIcon
                  className="size-3.5 shrink-0 translate-y-0.5 text-muted-foreground transition-transform group-open:rotate-90"
                  aria-hidden
                />
                {n.title}
              </span>
              {cp(n.creditPoints) ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {cp(n.creditPoints)}
                </span>
              ) : null}
            </summary>
            <div className="px-4 pb-4">
              <GroupBody
                node={n}
                linkYear={linkYear}
                linkableUnits={linkableUnits}
                ratings={ratings}
              />
            </div>
          </details>
        ) : (
          <EntityRows
            key={i}
            rows={[itemRow(n, linkableUnits)]}
            linkYear={linkYear}
            ratings={ratings}
          />
        )
      )}
    </div>
  )
}

function itemRow(
  n: Extract<CurriculumNode, { kind: "item" }>,
  linkableUnits: ReadonlySet<string>
): EntityRowData {
  return {
    kind: n.entity ?? "unit",
    code: n.code,
    title: n.name,
    note: n.creditPoints ? `${n.creditPoints} cp` : null,
    showKind: true,
    linkable:
      n.entity == null
        ? false
        : n.entity === "unit"
          ? linkableUnits.has(n.code)
          : true,
  }
}

function GroupBody({
  node,
  linkYear,
  linkableUnits,
  ratings,
}: {
  node: Extract<CurriculumNode, { kind: "group" }>
  linkYear: string | null
  linkableUnits: ReadonlySet<string>
  ratings: Ratings
}) {
  // Runs of items render as one list; subgroups nest below.
  const blocks: Array<
    | { type: "items"; items: Extract<CurriculumNode, { kind: "item" }>[] }
    | { type: "group"; node: Extract<CurriculumNode, { kind: "group" }> }
  > = []
  for (const c of node.children) {
    const last = blocks.at(-1)
    if (c.kind === "item") {
      if (last?.type === "items") last.items.push(c)
      else blocks.push({ type: "items", items: [c] })
    } else blocks.push({ type: "group", node: c })
  }
  return (
    <div className="flex flex-col gap-3">
      {node.description ? (
        <Prose
          html={node.description}
          linkYear={linkYear}
          className="text-muted-foreground"
        />
      ) : null}
      {blocks.map((b, i) =>
        b.type === "items" ? (
          <EntityRows
            key={i}
            rows={b.items.map((it) => itemRow(it, linkableUnits))}
            linkYear={linkYear}
            ratings={ratings}
          />
        ) : (
          <div key={i} className="border-l-2 pl-4">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h4 className="text-sm font-semibold">{b.node.title}</h4>
              {cp(b.node.creditPoints) ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {cp(b.node.creditPoints)}
                </span>
              ) : null}
            </div>
            <GroupBody
              node={b.node}
              linkYear={linkYear}
              linkableUnits={linkableUnits}
              ratings={ratings}
            />
          </div>
        )
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Requisite rules
 * ------------------------------------------------------------------ */

const REQUISITE_LABEL: Record<string, { title: string; note?: string }> = {
  prerequisite: {
    title: "Prerequisites",
    note: "Pass these before you enrol.",
  },
  corequisite: {
    title: "Corequisites",
    note: "Pass these before, or take them in the same semester.",
  },
  prohibition: {
    title: "Prohibitions",
    note: "You can't enrol if you have passed any of these.",
  },
  permission: { title: "Permission required" },
  other: { title: "Other requirements" },
}

type RuleUnit = { code: string; title: string | null; linkable: boolean }

/**
 * A unit's requisite rules as groups a student can read at a glance:
 * "One of" and "All of" boxes of unit tiles, joined by "and" or "or".
 */
export async function RequisiteRules({
  blocks,
  titles,
  linkable,
  linkYear,
}: {
  blocks: RequisiteBlock[]
  titles: Record<string, string>
  linkable: ReadonlySet<string>
  linkYear: string | null
}) {
  const unit = (code: string, name?: string): RuleUnit => ({
    code,
    title: titles[code] ?? name ?? null,
    linkable: linkable.has(code),
  })
  const codes: string[] = []
  const collect = (list: RequisiteContainer[]) => {
    for (const c of list) {
      for (const l of c.relationships ?? []) codes.push(l.academic_item_code)
      collect(c.containers ?? [])
    }
  }
  for (const b of blocks) collect(b.rule ?? [])
  const ratings = await loadRatings(
    codes.map((code) => ({ kind: "unit", code }))
  )
  return (
    <div className="flex flex-col gap-6">
      {blocks.map((b, i) => {
        const label = REQUISITE_LABEL[b.requisiteType] ?? {
          title: b.requisiteType,
        }
        return (
          <div key={i} className="flex flex-col gap-2">
            <div>
              <h3 className="text-sm font-semibold">{label.title}</h3>
              {label.note ? (
                <p className="text-xs text-muted-foreground">{label.note}</p>
              ) : null}
            </div>
            <RuleGroup
              containers={b.rule ?? []}
              any={false}
              unit={unit}
              linkYear={linkYear}
              ratings={ratings}
              depth={0}
            />
          </div>
        )
      })}
    </div>
  )
}

function Joiner({ any }: { any: boolean }) {
  return (
    <div className="flex items-center gap-2 py-0.5" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {any ? "or" : "and"}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

/** Sibling containers, which the handbook joins with AND at the top. */
function RuleGroup({
  containers,
  any,
  unit,
  linkYear,
  ratings,
  depth,
}: {
  containers: RequisiteContainer[]
  any: boolean
  unit: (code: string, name?: string) => RuleUnit
  linkYear: string | null
  ratings: Ratings
  depth: number
}) {
  const parts = containers.filter(
    (c) => (c.relationships?.length ?? 0) + (c.containers?.length ?? 0) > 0
  )
  return (
    <div className="flex flex-col gap-2">
      {parts.map((c, i) => (
        <div key={i} className="flex flex-col gap-2">
          {i > 0 ? <Joiner any={any} /> : null}
          <RuleBox
            container={c}
            unit={unit}
            linkYear={linkYear}
            ratings={ratings}
            depth={depth}
          />
        </div>
      ))}
    </div>
  )
}

function RuleBox({
  container,
  unit,
  linkYear,
  ratings,
  depth,
}: {
  container: RequisiteContainer
  unit: (code: string, name?: string) => RuleUnit
  linkYear: string | null
  ratings: Ratings
  depth: number
}) {
  const leaves = (container.relationships ?? []).map((l) =>
    unit(l.academic_item_code, l.academic_item_name)
  )
  const subs = container.containers ?? []
  const any =
    (container.parent_connector?.value ?? "AND").toUpperCase() === "OR"
  const count = leaves.length + subs.length
  // A group that only wraps one other group adds nothing: show the
  // inner one ("All of" around a single "One of").
  if (leaves.length === 0 && subs.length === 1) {
    return (
      <RuleBox
        container={subs[0]}
        unit={unit}
        linkYear={linkYear}
        ratings={ratings}
        depth={depth}
      />
    )
  }
  // One unit on its own needs no box.
  if (count === 1 && leaves.length === 1) {
    return <UnitTiles units={leaves} linkYear={linkYear} ratings={ratings} />
  }
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-control p-3",
        depth % 2 === 0 ? "bg-muted/50" : "border bg-card"
      )}
    >
      <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {any ? "One of" : "All of"}
      </span>
      {leaves.length > 0 ? (
        <UnitTiles units={leaves} linkYear={linkYear} ratings={ratings} />
      ) : null}
      {subs.length > 0 ? (
        <>
          {leaves.length > 0 ? <Joiner any={any} /> : null}
          <RuleGroup
            containers={subs}
            any={any}
            unit={unit}
            linkYear={linkYear}
            ratings={ratings}
            depth={depth + 1}
          />
        </>
      ) : null}
    </div>
  )
}
