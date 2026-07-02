"use client"

import Link from "next/link"
import { ArrowUpRightIcon } from "lucide-react"

import type { PublicCourseForAction, PublicUnitForAction } from "@/app/actions"
import type {
  PlannerCourseWithAoS,
  PlannerOffering,
  PlannerUnit,
} from "@/lib/planner/types"
import type { TreeControlsValue } from "@/lib/tree/payload"
import type { TreeEdge } from "@/lib/tree/types"

export interface EntityFactsProps {
  controls: TreeControlsValue
  units: Record<string, PlannerUnit>
  offerings: Record<string, PlannerOffering[]>
  edges: TreeEdge[]
  course: PlannerCourseWithAoS | null
  /** Server-fetched rich details for the seeded entity. */
  details: {
    unit: PublicUnitForAction | null
    course: PublicCourseForAction | null
  }
  /** Re-seed the graph with a specific AoS (course-mode quick action). */
  onPickAos: (code: string | null) => void
  /** Navigate the workbench to a different unit/course. */
  onPickUnit: (code: string) => void
  onPickCourse: (code: string) => void
  /** Curated list of well-known L1 units for the empty state. */
  featured: ReadonlyArray<{ code: string; title: string; level: string | null }>
}

/**
 * Below-the-workbench detail panel. Three modes:
 *
 *   - Unit mode → synopsis, facts list, prereqs / unlocks / offerings
 *     / AoS membership as proper bulleted sections.
 *   - Course mode → overview, facts list, AoS grouped by kind.
 *   - Empty → "Start exploring" hint with crawlable anchor links to
 *     popular first-year units.
 *
 * Deliberately *no monospaced* type — student-facing copy reads better
 * in the body font, and the code (e.g. "C2001") is treated as a small
 * subtitle rather than a tag. AoS labels show titles only; the raw
 * `aosCode` (often a synthetic "C2001:part-d:…" namespace) is hidden
 * from human-facing copy.
 */
export function EntityFacts(props: EntityFactsProps) {
  const { controls } = props
  if (controls.mode === "unit") {
    if (!controls.unitCode) return <EmptyHint {...props} />
    return <UnitFacts {...props} code={controls.unitCode} />
  }
  if (controls.mode === "course") {
    if (!controls.courseCode) return <EmptyHint {...props} />
    return <CourseFacts {...props} />
  }
  return null
}

function UnitFacts({
  code,
  units,
  offerings,
  edges,
  details,
}: EntityFactsProps & { code: string }) {
  const unit = units[code]
  const unitOfferings = offerings[code] ?? []
  const detail = details.unit
  const year = detail?.year ?? null

  // Derive prereq / unlock codes from the loaded graph edges.
  const prereqs = new Set<string>()
  const unlocks = new Set<string>()
  for (const e of edges) {
    if (e.type === "prohibition") continue
    if (e.from === code) prereqs.add(e.to)
    if (e.to === code) unlocks.add(e.from)
  }

  const handbookUrl = year
    ? `https://handbook.monash.edu/${year}/units/${code}`
    : null

  // Group offerings by teaching period for a cleaner list.
  const offeringsByPeriod = new Map<string, PlannerOffering[]>()
  for (const o of unitOfferings) {
    const key = o.teachingPeriod || "Teaching period TBA"
    const list = offeringsByPeriod.get(key) ?? []
    list.push(o)
    offeringsByPeriod.set(key, list)
  }

  return (
    <section className="flex flex-col gap-7 rounded-3xl border bg-card p-5 shadow-card sm:p-7">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl leading-tight font-semibold sm:text-3xl">
          {unit?.title ?? code}
        </h1>
        <p className="text-sm text-muted-foreground tabular-nums">{code}</p>
      </header>

      {detail?.handbookSynopsis ? (
        <Block label="Synopsis">
          <div
            className="prose prose-sm max-w-none text-foreground/90 [&_a]:text-[var(--monash-purple-deep)] [&_a]:underline [&_p]:my-2"
            dangerouslySetInnerHTML={{ __html: detail.handbookSynopsis }}
          />
          {handbookUrl ? <HandbookLink href={handbookUrl} year={year} /> : null}
        </Block>
      ) : null}

      <Block label="Quick facts">
        <FactsList
          rows={[
            unit
              ? { label: "Credit points", value: `${unit.creditPoints}` }
              : null,
            // `units.level` arrives as "Level 2" already (the lite-ref
            // label) — render under a "Level" row by stripping the
            // redundant prefix, otherwise you get "Level: Level 2".
            unit?.level
              ? {
                  label: "Level",
                  value: unit.level.replace(/^Level\s+/i, ""),
                }
              : null,
            detail?.undergradPostgrad
              ? { label: "Audience", value: detail.undergradPostgrad }
              : null,
            detail?.type ? { label: "Type", value: detail.type } : null,
            unit?.school ? { label: "School", value: unit.school } : null,
            detail?.academicOrg && detail.academicOrg !== unit?.school
              ? { label: "Faculty", value: detail.academicOrg }
              : null,
            year ? { label: "Handbook year", value: year } : null,
          ]}
        />
      </Block>

      <Block label={`Prerequisites${prereqs.size ? ` (${prereqs.size})` : ""}`}>
        {prereqs.size === 0 ? (
          <EmptyLine>No prereqs in the handbook graph.</EmptyLine>
        ) : (
          <UnitBullets codes={[...prereqs].sort()} units={units} />
        )}
      </Block>

      <Block
        label={`What it unlocks${unlocks.size ? ` (${unlocks.size})` : ""}`}
      >
        {unlocks.size === 0 ? (
          <EmptyLine>
            Nothing in the visible graph depends on this unit.
          </EmptyLine>
        ) : (
          <UnitBullets codes={[...unlocks].sort()} units={units} />
        )}
      </Block>

      {offeringsByPeriod.size > 0 ? (
        <Block label={`Offerings (${unitOfferings.length})`}>
          <ul className="flex flex-col gap-1.5 text-sm">
            {[...offeringsByPeriod.entries()].map(([period, list]) => (
              <li key={period} className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium">{period}</span>
                <span className="text-xs text-muted-foreground">
                  {list
                    .map((o) =>
                      [o.location, o.attendanceModeCode]
                        .filter(Boolean)
                        .join(" · ")
                    )
                    .filter(Boolean)
                    .join(" / ") || "mode TBA"}
                </span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {detail && detail.partOfAreasOfStudy.length > 0 ? (
        <Block
          label={`Listed in ${detail.partOfAreasOfStudy.length} area${
            detail.partOfAreasOfStudy.length === 1 ? "" : "s"
          } of study`}
        >
          <ul className="flex flex-col gap-1 text-sm">
            {detail.partOfAreasOfStudy.map((a) => (
              <li key={a.code} className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium">{a.title}</span>
                <span className="text-xs text-muted-foreground">
                  {a.grouping}
                </span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
    </section>
  )
}

function CourseFacts({ course, onPickAos, details }: EntityFactsProps) {
  if (!course) return null
  const detail = details.course
  const year = detail?.year ?? course.year

  const aosByKind = new Map<string, typeof course.areasOfStudy>()
  for (const a of course.areasOfStudy) {
    const list = aosByKind.get(a.kind) ?? []
    list.push(a)
    aosByKind.set(a.kind, list)
  }
  const KIND_ORDER = [
    "major",
    "extended_major",
    "specialisation",
    "minor",
    "elective",
    "other",
  ] as const
  const KIND_LABEL: Record<string, string> = {
    major: "Majors",
    extended_major: "Extended majors",
    specialisation: "Specialisations",
    minor: "Minors",
    elective: "Elective groupings",
    other: "Other components",
  }
  const modes: string[] = []
  if (detail?.onCampus) modes.push("On-campus")
  if (detail?.online) modes.push("Online")
  if (detail?.fullTime) modes.push("Full-time")
  if (detail?.partTime) modes.push("Part-time")

  const handbookUrl = `https://handbook.monash.edu/${year}/courses/${course.code}`

  return (
    <section className="flex flex-col gap-7 rounded-3xl border bg-card p-5 shadow-card sm:p-7">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl leading-tight font-semibold sm:text-3xl">
          {course.title}
        </h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          {course.code}
        </p>
      </header>

      {detail?.overview ? (
        <Block label="Overview">
          <div
            className="prose prose-sm max-w-none text-foreground/90 [&_a]:text-[var(--monash-purple-deep)] [&_a]:underline [&_p]:my-2"
            dangerouslySetInnerHTML={{ __html: detail.overview }}
          />
          <HandbookLink href={handbookUrl} year={year} />
        </Block>
      ) : null}

      <Block label="Quick facts">
        <FactsList
          rows={[
            { label: "Credit points", value: `${course.creditPoints}` },
            course.aqfLevel
              ? { label: "Qualification", value: course.aqfLevel }
              : null,
            course.type ? { label: "Type", value: course.type } : null,
            detail?.school ? { label: "Faculty", value: detail.school } : null,
            modes.length > 0
              ? { label: "Modes", value: modes.join(" · ") }
              : null,
            detail?.cricosCode
              ? { label: "CRICOS code", value: detail.cricosCode }
              : null,
            { label: "Handbook year", value: year },
          ]}
        />
      </Block>

      {course.areasOfStudy.length > 0 ? (
        <Block label={`Areas of study (${course.areasOfStudy.length})`}>
          <div className="flex flex-col gap-5">
            {KIND_ORDER.filter((k) => aosByKind.has(k)).map((kind) => {
              const list = aosByKind.get(kind)!
              return (
                <div key={kind}>
                  <h4 className="mb-2 text-sm font-semibold">
                    {KIND_LABEL[kind]}
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      ({list.length})
                    </span>
                  </h4>
                  <ul className="flex flex-col gap-0.5 text-sm">
                    {list.map((a) => (
                      <li
                        key={a.code}
                        className="flex items-baseline gap-2 before:text-xs before:text-muted-foreground/60 before:content-['—']"
                      >
                        <button
                          type="button"
                          onClick={() => onPickAos(a.code)}
                          className="text-left text-foreground/90 hover:text-[var(--monash-purple-deep)] hover:underline"
                          title={`Re-seed the graph with ${a.title}`}
                        >
                          {a.title}
                        </button>
                        {a.creditPoints != null ? (
                          <span className="text-xs text-muted-foreground">
                            {a.creditPoints} cp
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </Block>
      ) : null}
    </section>
  )
}

function EmptyHint({ featured }: EntityFactsProps) {
  return (
    <section className="flex flex-col gap-4 rounded-3xl border bg-card p-5 shadow-card sm:p-7">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Start exploring</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Pick a course on the rail to see its prereq tree, or search a unit
          code to centre the graph on it. A few popular entry-level units to
          start from:
        </p>
      </header>
      {featured.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-sm">
          {featured.map((u) => (
            <li
              key={u.code}
              className="flex items-baseline gap-2 before:text-xs before:text-muted-foreground/60 before:content-['—']"
            >
              <Link
                href={`/tree?unit=${u.code}`}
                prefetch={false}
                className="text-foreground/90 hover:text-[var(--monash-purple-deep)] hover:underline"
              >
                {u.title}
              </Link>
              <span className="text-xs text-muted-foreground">{u.code}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

/** A labelled section. The label sits above the content as a
 *  small uppercase title, mirroring the controls-rail conventions. */
function Block({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </h3>
      {children}
    </div>
  )
}

/** Label / value rows. Single-column at small widths, two-column on
 *  wider viewports so the badge-row's worth of info fits in one card
 *  without sprawl. */
function FactsList({
  rows,
}: {
  rows: Array<{ label: string; value: string } | null>
}) {
  const filtered = rows.filter(
    (r): r is { label: string; value: string } => r != null
  )
  if (filtered.length === 0) return null
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
      {filtered.map((r) => (
        <div
          key={r.label}
          className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1 last:border-b-0 sm:last:border-b"
        >
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd className="text-right font-medium text-foreground">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Prereq/unlock bullet list — links to /tree?unit=, shows the unit
 *  title (with the code as a small subtitle next to it). */
function UnitBullets({
  codes,
  units,
}: {
  codes: string[]
  units: Record<string, PlannerUnit>
}) {
  return (
    <ul className="flex flex-col gap-0.5 text-sm">
      {codes.map((c) => {
        const u = units[c]
        return (
          <li
            key={c}
            className="flex items-baseline gap-2 before:text-xs before:text-muted-foreground/60 before:content-['—']"
          >
            <Link
              href={`/tree?unit=${c}`}
              prefetch={false}
              className="text-foreground/90 hover:text-[var(--monash-purple-deep)] hover:underline"
            >
              {u?.title ?? c}
            </Link>
            <span className="text-xs text-muted-foreground">{c}</span>
          </li>
        )
      })}
    </ul>
  )
}

function HandbookLink({ href, year }: { href: string; year: string | null }) {
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      Sourced from the{" "}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-baseline gap-1 underline hover:text-foreground"
      >
        Monash Handbook{year ? ` ${year}` : ""}
        <ArrowUpRightIcon className="size-3" />
      </a>
      .
    </p>
  )
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}
