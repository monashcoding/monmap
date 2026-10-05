import Link from "next/link"
import { ArrowUpRightIcon, ChevronRightIcon } from "lucide-react"

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
import { cn } from "@/lib/utils"

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

/**
 * The top card of a handbook page: breadcrumbs, the code and title,
 * a line of key facts, the year picker and the Monash Handbook link.
 */
export function EntityHero({
  kind,
  kindLabel,
  code,
  title,
  facts,
  subtitle,
  breadcrumbs,
  year,
  years,
  yearHref,
  handbookUrl,
  notice,
}: {
  kind: EntityKind
  kindLabel?: string
  code: string
  title: string
  facts: Array<string | null | undefined | false>
  subtitle?: string | null
  breadcrumbs: Crumb[]
  year: string
  years: string[]
  yearHref: (year: string) => string
  handbookUrl: string
  notice?: React.ReactNode
}) {
  const shown = facts.filter((f): f is string => !!f)
  return (
    <header className="flex flex-col gap-4 rounded-panel border bg-card p-5 shadow-card sm:p-7">
      <Breadcrumbs items={breadcrumbs} />
      <div className="flex flex-wrap items-start justify-between gap-4">
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
          <h1 className="text-2xl leading-tight font-semibold text-balance sm:text-3xl">
            <span className="tabular-nums">{code}</span>{" "}
            <span className="font-medium">{title}</span>
          </h1>
          {subtitle ? (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
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
            <ArrowUpRightIcon className="size-3.5" />
          </a>
        </div>
      </div>
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

/** Jump links to the page's sections. */
export function SectionNav({
  items,
}: {
  items: Array<{ id: string; label: string } | null | false>
}) {
  const shown = items.filter((i): i is { id: string; label: string } => !!i)
  if (shown.length < 3) return null
  return (
    <nav
      aria-label="On this page"
      className="-mt-1 flex flex-wrap gap-1.5 sm:-mt-2"
    >
      {shown.map((i) => (
        <a
          key={i.id}
          href={`#${i.id}`}
          className="rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground hover:border-ring hover:text-foreground"
        >
          {i.label}
        </a>
      ))}
    </nav>
  )
}

/** The main column beside a sidebar of facts and links. */
export function DetailColumns({
  main,
  aside,
}: {
  main: React.ReactNode
  aside: React.ReactNode
}) {
  return (
    <div className="grid items-start gap-3 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-3 sm:gap-5">{main}</div>
      <aside className="flex min-w-0 flex-col gap-3 sm:gap-5">{aside}</aside>
    </div>
  )
}

export function Section({
  id,
  title,
  children,
  className,
}: {
  id?: string
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={cn(
        "scroll-mt-20 rounded-panel border bg-card p-5 shadow-card sm:p-6",
        className
      )}
    >
      <h2
        id={id ? `${id}-title` : undefined}
        className="mb-3 text-base font-semibold"
      >
        {title}
      </h2>
      {children}
    </section>
  )
}

export function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-5 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase first:mt-0">
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

export interface EntityRowData {
  kind: EntityKind
  code: string
  title: string | null
  /** Right-hand note, such as "6 credit points" or "Major". */
  note?: string | null
  /** False when MonMap has no page for the code. */
  linkable?: boolean
}

export function EntityRows({
  rows,
  linkYear,
  className,
}: {
  rows: EntityRowData[]
  linkYear: string | null
  className?: string
}) {
  if (rows.length === 0) return null
  return (
    <ul
      className={cn("flex flex-col divide-y rounded-control border", className)}
    >
      {rows.map((r, i) => (
        <li key={`${r.kind}:${r.code}:${i}`}>
          <EntityRow row={r} linkYear={linkYear} />
        </li>
      ))}
    </ul>
  )
}

function EntityRow({
  row,
  linkYear,
}: {
  row: EntityRowData
  linkYear: string | null
}) {
  const body = (
    <>
      <span className="flex min-w-0 items-baseline gap-2">
        {row.kind !== "unit" ? (
          <KindBadge kind={row.kind} className="translate-y-[-1px]" />
        ) : null}
        <span className="shrink-0 font-semibold tabular-nums">{row.code}</span>
        {row.title ? (
          <span className="min-w-0 text-foreground/80 underline-offset-2 group-hover:underline">
            {row.title}
          </span>
        ) : null}
      </span>
      {row.note ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          {row.note}
        </span>
      ) : null}
    </>
  )
  const cls = "flex items-baseline justify-between gap-3 px-3 py-2 text-sm"
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
export function CurriculumTree({
  nodes,
  linkYear,
  linkableUnits,
}: {
  nodes: CurriculumNode[]
  linkYear: string | null
  linkableUnits: ReadonlySet<string>
}) {
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
              />
            </div>
          </details>
        ) : (
          <EntityRows
            key={i}
            rows={[itemRow(n, linkableUnits)]}
            linkYear={linkYear}
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
}: {
  node: Extract<CurriculumNode, { kind: "group" }>
  linkYear: string | null
  linkableUnits: ReadonlySet<string>
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

const REQUISITE_LABEL: Record<string, string> = {
  prerequisite: "Prerequisites",
  corequisite: "Corequisites",
  prohibition: "Prohibitions",
  permission: "Permission",
  other: "Other requirements",
}

/**
 * A unit's requisite rules as nested "all of" / "any of" lists, each
 * unit a link to its page.
 */
export function RequisiteRules({
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
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((b, i) => (
        <div key={i}>
          <SubHeading>
            {REQUISITE_LABEL[b.requisiteType] ?? b.requisiteType}
          </SubHeading>
          {b.requisiteType === "prohibition" ? (
            <p className="mb-2 text-xs text-muted-foreground">
              You cannot enrol in this unit if you have passed any of these.
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            {(b.rule ?? []).map((c, j) => (
              <RuleContainer
                key={j}
                container={c}
                depth={0}
                titles={titles}
                linkable={linkable}
                linkYear={linkYear}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function RuleContainer({
  container,
  depth,
  titles,
  linkable,
  linkYear,
}: {
  container: RequisiteContainer
  depth: number
  titles: Record<string, string>
  linkable: ReadonlySet<string>
  linkYear: string | null
}) {
  const leaves = container.relationships ?? []
  const subs = container.containers ?? []
  const count = leaves.length + subs.length
  if (count === 0) return null
  const any =
    (container.parent_connector?.value ?? "AND").toUpperCase() === "OR"
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5",
        depth > 0 && "border-l-2 border-dashed pl-3"
      )}
    >
      {count > 1 ? (
        <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {any ? "Any one of" : "All of"}
        </span>
      ) : null}
      {leaves.length > 0 ? (
        <EntityRows
          rows={leaves.map((l) => ({
            kind: "unit" as const,
            code: l.academic_item_code,
            title: titles[l.academic_item_code] ?? l.academic_item_name ?? null,
            linkable: linkable.has(l.academic_item_code),
          }))}
          linkYear={linkYear}
        />
      ) : null}
      {subs.map((c, i) => (
        <RuleContainer
          key={i}
          container={c}
          depth={depth + 1}
          titles={titles}
          linkable={linkable}
          linkYear={linkYear}
        />
      ))}
    </div>
  )
}
