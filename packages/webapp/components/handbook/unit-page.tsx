import type { Metadata } from "next"
import { notFound } from "next/navigation"

import {
  AOS_KIND_LABEL,
  fetchUnitPage,
  kindFromCode,
  type UnitPageData,
} from "@/lib/db/handbook"
import { entityHref, monashHandbookUrl } from "@/lib/handbook/links"
import { resolveEntity } from "@/lib/handbook/resolve"
import { PERIOD_KIND_LABEL } from "@/lib/planner/teaching-period"
import { absoluteUrl } from "@/lib/seo"
import { prefetchTreeData } from "@/lib/tree/prefetch"
import { cn } from "@/lib/utils"

import {
  BookOpenIcon,
  CalendarDaysIcon,
  ClipboardCheckIcon,
  ClockIcon,
  InfoIcon,
  LibraryIcon,
  LockIcon,
  MapIcon,
  NetworkIcon,
  TargetIcon,
  UsersIcon,
} from "lucide-react"

import { EntityGraph } from "./entity-graph"
import { JsonLd, breadcrumbLd, ratingLd } from "./json-ld"
import { QuickAnswers, SegText } from "./quick-answers"
import {
  isExam,
  levelNumber,
  unitFacts,
  workloadHours,
} from "@/lib/handbook/facts"
import {
  downstreamReach,
  plain,
  ruleSegs,
  unitDescription,
  unitLede,
  unitQuestions,
} from "@/lib/handbook/summary"
import {
  fetchEntityReviews,
  ReviewsSection,
} from "@/components/reviews/reviews-section"
import {
  DetailLayout,
  EntityCards,
  EntityHero,
  EntityRows,
  FactList,
  HandbookMain,
  Notice,
  Prose,
  RequisiteRules,
  Section,
  SubHeading,
  YearLinks,
} from "./parts"

function periodSummary(u: UnitPageData): string | null {
  const kinds = [...new Set(u.offerings.map((o) => o.periodKind))].filter(
    (k) => k !== "OTHER"
  )
  return kinds.length ? kinds.map((k) => PERIOD_KIND_LABEL[k]).join(", ") : null
}

function campusSummary(u: UnitPageData): string | null {
  const campuses = [...new Set(u.offerings.flatMap((o) => o.location ?? []))]
  if (campuses.length === 0) return null
  return campuses.length > 3
    ? `${campuses.slice(0, 3).join(", ")} and ${campuses.length - 3} more`
    : campuses.join(", ")
}

/** "Exam 60%" or "No exam", the question students ask first. */
function assessmentStat(u: UnitPageData) {
  if (u.assessments.length === 0) return null
  const exams = u.assessments.filter(isExam)
  const examWeight = exams.reduce((n, a) => n + (a.weight ?? 0), 0)
  const others = u.assessments.length - exams.length
  return exams.length > 0
    ? {
        label: "Assessment",
        value: examWeight > 0 ? `Exam ${examWeight}%` : "Has an exam",
        hint: others
          ? `and ${others} other task${others === 1 ? "" : "s"}`
          : null,
      }
    : {
        label: "Assessment",
        value: "No exam",
        hint: `${u.assessments.length} task${u.assessments.length === 1 ? "" : "s"}`,
      }
}

const MODE_LABEL: Record<string, string> = {
  "ON-CAMPUS": "On campus",
  ONLINE: "Online",
  FLEXIBLE: "Flexible",
  BLENDED: "Blended",
  "ON-BLK": "On campus, block",
  IMMERSIVE: "Immersive",
}

function modeLabel(code: string | null): string {
  if (!code) return "-"
  return (
    MODE_LABEL[code] ??
    code.charAt(0) + code.slice(1).toLowerCase().replace(/-/g, " ")
  )
}

// One colour per task in the assessment bar, from the palette.
const SEGMENT_COLOURS = [
  "bg-emphasis",
  "bg-info",
  "bg-primary",
  "bg-success",
  "bg-muted-foreground/60",
]

export async function unitMetadata(
  rawCode: string,
  rawYear: string | null
): Promise<Metadata> {
  const r = await resolveEntity("unit", rawCode, rawYear)
  const [u, reviews] = await Promise.all([
    fetchUnitPage(r.code, r.year),
    fetchEntityReviews("unit", r.code),
  ])
  if (!u) return { title: r.code, robots: { index: false } }
  const yearNote = r.linkYear ? ` (${r.year} handbook)` : ""
  // The searches this page answers: "FIT2004 review", "FIT2004
  // prerequisites". The facts in the description are MonMap's own.
  const title = `${u.code} ${u.title}${yearNote}: Reviews & Prerequisites`
  const description = unitDescription(unitFacts(u, reviews.summary, 0))
  return {
    title,
    description,
    alternates: { canonical: r.canonical },
    robots: r.indexable ? undefined : { index: false, follow: true },
    openGraph: { title, description, type: "article", url: r.canonical },
    twitter: { card: "summary_large_image", title, description },
  }
}

export async function UnitPage({
  rawCode,
  rawYear,
}: {
  rawCode: string
  rawYear: string | null
}) {
  const r = await resolveEntity("unit", rawCode, rawYear)
  const [u, graph, reviews] = await Promise.all([
    fetchUnitPage(r.code, r.year),
    prefetchTreeData({
      mode: "unit",
      unitCode: r.code,
      courseCode: null,
      aosCode: null,
      direction: "both",
      year: r.year,
    }),
    fetchEntityReviews("unit", r.code),
  ])
  if (!u) notFound()

  const { linkYear } = r
  const linkable = new Set(u.linkable)
  const facts = unitFacts(
    u,
    reviews.summary,
    downstreamReach(u.code, graph.graph.edges)
  )
  const yearHref = (y: string) =>
    entityHref("unit", u.code, y === r.latest ? null : y)
  const lvl = levelNumber(u.level)

  const hasRules = u.requisites.length > 0 || u.enrolmentRules.length > 0
  const hasGraph = graph.graph.nodes.length > 1
  const hasRequisites = hasRules || hasGraph || u.unlocks.length > 0
  const hasDelivery =
    u.workload != null ||
    u.activities.length > 0 ||
    u.teachingApproaches.length > 0
  const weighted = u.assessments.filter((a) => (a.weight ?? 0) > 0)
  const weightTotal = weighted.reduce((n, a) => n + (a.weight ?? 0), 0)

  const notice =
    r.year !== r.latest ? (
      <Notice>
        This is the {r.year} handbook entry.{" "}
        <a
          href={entityHref("unit", u.code)}
          className="font-semibold underline"
        >
          See the {r.latest} entry
        </a>
        .
      </Notice>
    ) : r.year !== r.siteLatest ? (
      <Notice>
        The {r.siteLatest} handbook has no page for {u.code}. This is its{" "}
        {r.year} entry, the latest one.
      </Notice>
    ) : null

  return (
    <HandbookMain year={r.year}>
      <EntityHero
        kind="unit"
        code={u.code}
        title={u.title}
        facts={[u.level, u.undergradPostgrad]}
        subtitle={u.school}
        stats={[
          { label: "Credit points", value: String(u.creditPoints) },
          {
            label: `Offered in ${r.year}`,
            value:
              periodSummary(u) ??
              (u.offerings.length ? "Other periods" : "Not offered"),
            hint: campusSummary(u),
          },
          assessmentStat(u),
          workloadHours(u)
            ? {
                label: "Workload",
                value: workloadHours(u)!,
                hint: "per semester",
              }
            : null,
        ]}
        breadcrumbs={[
          { label: "Search", href: "/search" },
          { label: "Units", href: "/search?type=units" },
          ...(lvl
            ? [
                {
                  label: `Level ${lvl}`,
                  href: `/search?type=units&level=${lvl}`,
                },
              ]
            : []),
          { label: u.code },
        ]}
        year={r.year}
        years={r.years}
        yearHref={yearHref}
        handbookUrl={monashHandbookUrl("unit", u.code, r.year)}
        rating={reviews.summary}
        lede={
          <SegText
            segs={unitLede(facts)}
            linkYear={linkYear}
            linkableUnits={linkable}
          />
        }
        notice={notice}
      />

      <DetailLayout
        toc={[
          { id: "reviews", label: "Reviews" },
          hasRequisites ? { id: "requisites", label: "Requisites" } : null,
          u.synopsis ? { id: "overview", label: "Overview" } : null,
          { id: "offerings", label: "Offerings" },
          u.assessments.length > 0
            ? { id: "assessment", label: "Assessment" }
            : null,
          u.learningOutcomes.length > 0
            ? { id: "outcomes", label: "Learning outcomes" }
            : null,
          hasDelivery ? { id: "workload", label: "Workload" } : null,
          u.resources.length > 0
            ? { id: "resources", label: "Resources" }
            : null,
          u.areasOfStudy.length > 0
            ? { id: "where-it-fits", label: "Where it fits" }
            : null,
          u.contacts.length > 0 ? { id: "contacts", label: "Contacts" } : null,
          { id: "faq", label: "Common questions" },
          { id: "details", label: "More details" },
        ]}
      >
        <ReviewsSection
          kind="unit"
          code={u.code}
          title={u.title}
          data={reviews}
        />

        {hasRequisites ? (
          <Section id="requisites" title="Requisites" icon={NetworkIcon}>
            <div className="flex flex-col gap-6">
              {hasGraph ? (
                <EntityGraph
                  initial={graph}
                  year={r.year}
                  linkYear={linkYear}
                  emptyText=""
                />
              ) : null}

              <div className="grid gap-6 md:grid-cols-2">
                <div className="flex flex-col gap-3">
                  <SubHeading>Before {u.code}</SubHeading>
                  {u.requisites.length > 0 ? (
                    <RequisiteRules
                      blocks={u.requisites}
                      titles={u.titles}
                      linkable={linkable}
                      linkYear={linkYear}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No prerequisites or corequisites
                      {u.enrolmentRules.length > 0
                        ? " besides the enrolment rules below"
                        : ""}
                      .
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  <SubHeading>After {u.code}</SubHeading>
                  {u.unlocks.length > 0 ? (
                    <>
                      <p className="text-xs text-muted-foreground">
                        {u.unlocks.length} unit
                        {u.unlocks.length === 1 ? "" : "s"} list {u.code} as a
                        prerequisite or corequisite.
                      </p>
                      <UnlockList
                        u={u}
                        linkable={linkable}
                        linkYear={linkYear}
                      />
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No unit lists {u.code} as a prerequisite in the {r.year}{" "}
                      handbook.
                    </p>
                  )}
                </div>
              </div>

              {u.enrolmentRules.length > 0 ? (
                <div className="flex flex-col gap-2 rounded-control bg-muted/50 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <LockIcon className="size-3.5" aria-hidden />
                    Enrolment rules
                  </h3>
                  {u.enrolmentRules.map((html, i) => (
                    <Prose key={i} html={html} linkYear={linkYear} />
                  ))}
                </div>
              ) : null}

              {u.equivalents.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <SubHeading>Equivalent units</SubHeading>
                  <p className="text-xs text-muted-foreground">
                    The same content under another code. Only one of them
                    counts.
                  </p>
                  <EntityRows
                    rows={u.equivalents.map((c) => ({
                      kind: "unit" as const,
                      code: c,
                      title: u.titles[c] ?? null,
                      linkable: linkable.has(c),
                    }))}
                    linkYear={linkYear}
                  />
                </div>
              ) : null}
            </div>
          </Section>
        ) : null}

        {u.synopsis ? (
          <Section clamp id="overview" title="Overview" icon={BookOpenIcon}>
            <Prose
              html={u.synopsis}
              linkYear={linkYear}
              className="text-[15px]"
            />
          </Section>
        ) : null}

        <Section
          id="offerings"
          title={`Offerings in ${r.year}`}
          icon={CalendarDaysIcon}
        >
          {u.offerings.length > 0 ? (
            <div className="overflow-x-auto rounded-control border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Teaching period
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Campus
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Mode
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {u.offerings.map((o, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 font-medium">
                        {i > 0 &&
                        u.offerings[i - 1].teachingPeriod ===
                          o.teachingPeriod ? (
                          <span className="sr-only">{o.teachingPeriod}</span>
                        ) : (
                          o.teachingPeriod
                        )}
                      </td>
                      <td className="px-4 py-2.5">{o.location ?? "-"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {modeLabel(o.attendanceModeCode)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              The {r.year} handbook lists no offerings for {u.code}.
            </p>
          )}
        </Section>

        {u.assessments.length > 0 ? (
          <Section id="assessment" title="Assessment" icon={ClipboardCheckIcon}>
            <div className="flex flex-col gap-4">
              {weightTotal > 0 ? (
                <div
                  className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
                  aria-hidden
                >
                  {weighted.map((a, i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-full border-r-2 border-card last:border-r-0",
                        SEGMENT_COLOURS[i % SEGMENT_COLOURS.length]
                      )}
                      style={{
                        width: `${((a.weight ?? 0) / Math.max(100, weightTotal)) * 100}%`,
                      }}
                    />
                  ))}
                </div>
              ) : null}
              <ul className="flex flex-col divide-y">
                {u.assessments.map((a, i) => {
                  const segment = weighted.indexOf(a)
                  return (
                    <li
                      key={i}
                      className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <span
                        className={cn(
                          "mt-1.5 size-2.5 shrink-0 rounded-full",
                          segment >= 0
                            ? SEGMENT_COLOURS[segment % SEGMENT_COLOURS.length]
                            : "border border-muted-foreground/50"
                        )}
                        aria-hidden
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-sm font-medium">{a.name}</span>
                        <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {a.type &&
                          a.type.toLowerCase() !== a.name.toLowerCase() ? (
                            <span>{a.type}</span>
                          ) : null}
                          {a.hurdle ? (
                            <span className="rounded-tag bg-primary/40 px-1.5 py-0.5 font-semibold text-primary-foreground">
                              {a.hurdle} hurdle
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">
                        {a.weight != null && a.weight > 0
                          ? `${a.weight}%`
                          : "-"}
                      </span>
                    </li>
                  )
                })}
              </ul>
              {u.assessmentNote ? (
                <p className="text-xs text-muted-foreground">
                  {u.assessmentNote}
                </p>
              ) : null}
            </div>
          </Section>
        ) : null}

        {u.learningOutcomes.length > 0 ? (
          <Section
            clamp
            id="outcomes"
            title="Learning outcomes"
            icon={TargetIcon}
          >
            <p className="mb-4 text-sm text-muted-foreground">
              When you finish this unit, you should be able to:
            </p>
            <ol className="flex flex-col gap-3">
              {u.learningOutcomes.map((o, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                    {i + 1}
                  </span>
                  <Prose html={o.html} linkYear={linkYear} className="pt-0.5" />
                </li>
              ))}
            </ol>
          </Section>
        ) : null}

        {hasDelivery ? (
          <Section id="workload" title="Workload and teaching" icon={ClockIcon}>
            <div className="flex flex-col gap-5">
              {u.activities.length > 0 || u.teachingApproaches.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {u.activities.map((a, i) => (
                    <li
                      key={i}
                      className="flex flex-col rounded-control border px-3.5 py-2"
                    >
                      <span className="text-xs text-muted-foreground">
                        {a.type}
                      </span>
                      <span className="text-sm font-semibold">
                        {a.duration ?? "-"}
                      </span>
                    </li>
                  ))}
                  {u.teachingApproaches.map((t) => (
                    <li
                      key={t.label}
                      className="flex flex-col rounded-control border px-3.5 py-2"
                    >
                      <span className="text-xs text-muted-foreground">
                        Teaching approach
                      </span>
                      <span className="text-sm font-semibold">{t.label}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {u.workload ? (
                <Prose html={u.workload} linkYear={linkYear} />
              ) : null}
              {u.teachingApproaches.some((t) => t.html)
                ? u.teachingApproaches.map((t) =>
                    t.html ? (
                      <Prose
                        key={t.label}
                        html={t.html}
                        linkYear={linkYear}
                        className="text-muted-foreground"
                      />
                    ) : null
                  )
                : null}
            </div>
          </Section>
        ) : null}

        {u.resources.length > 0 ? (
          <Section id="resources" title="Learning resources" icon={LibraryIcon}>
            <div className="grid gap-6 md:grid-cols-2">
              {u.resources.map((g) => (
                <div key={g.type} className="flex flex-col">
                  <SubHeading>{g.type}</SubHeading>
                  <div className="flex flex-col gap-2">
                    {g.items.map((html, i) => (
                      <Prose key={i} html={html} linkYear={linkYear} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        {u.areasOfStudy.length > 0 ? (
          <Section id="where-it-fits" title="Where it fits" icon={MapIcon}>
            <p className="mb-4 text-sm text-muted-foreground">
              {u.code} is part of {u.areasOfStudy.length} area
              {u.areasOfStudy.length === 1 ? "" : "s"} of study in the {r.year}{" "}
              handbook.
            </p>
            <EntityCards
              rows={u.areasOfStudy.map((a) => {
                const kind = kindFromCode(a.code)
                return {
                  kind: "aos" as const,
                  code: a.code,
                  title: a.title,
                  note: [kind ? AOS_KIND_LABEL[kind] : null, a.grouping.trim()]
                    .filter(Boolean)
                    .join(", "),
                }
              })}
              linkYear={linkYear}
            />
          </Section>
        ) : null}

        {u.contacts.length > 0 ? (
          <Section id="contacts" title="Contacts" icon={UsersIcon}>
            <dl className="grid gap-4 sm:grid-cols-2">
              {u.contacts.map((c) => (
                <div key={c.role}>
                  <dt className="mb-1 text-xs text-muted-foreground">
                    {c.role.replace(/\(s\)$/, "s")}
                  </dt>
                  {c.names.map((n) => (
                    <dd key={n} className="text-sm font-medium">
                      {n}
                    </dd>
                  ))}
                </div>
              ))}
            </dl>
          </Section>
        ) : null}

        <QuickAnswers
          items={unitQuestions(facts)}
          linkYear={linkYear}
          linkableUnits={linkable}
        />

        <Section id="details" title="More details" icon={InfoIcon}>
          <div className="grid gap-x-10 md:grid-cols-2">
            <FactList
              rows={[
                { label: "Credit points", value: u.creditPoints },
                u.level
                  ? { label: "Level", value: u.level.replace(/^Level\s+/i, "") }
                  : null,
                u.undergradPostgrad
                  ? { label: "Study level", value: u.undergradPostgrad }
                  : null,
                u.school ? { label: "Faculty", value: u.school } : null,
                u.academicOrg && u.academicOrg !== u.school
                  ? { label: "Organisational unit", value: u.academicOrg }
                  : null,
              ]}
            />
            <FactList
              rows={[
                u.type ? { label: "Type", value: u.type } : null,
                u.eftsl ? { label: "EFTSL", value: u.eftsl } : null,
                u.scaBand
                  ? { label: "Student contribution", value: u.scaBand }
                  : null,
                {
                  label: "Study abroad",
                  value: u.studyAbroad ? "Available" : "Not available",
                },
                u.workIntegratedLearning.length > 0
                  ? {
                      label: "Work integrated learning",
                      value: u.workIntegratedLearning.join(", "),
                    }
                  : null,
                {
                  label: "Handbook years",
                  value: (
                    <YearLinks
                      years={r.years}
                      current={r.year}
                      href={yearHref}
                    />
                  ),
                },
              ]}
            />
          </div>
        </Section>
      </DetailLayout>

      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Course",
            name: `${u.code} ${u.title}`,
            courseCode: u.code,
            // MonMap's own summary: always present, never the handbook copy.
            description: plain(unitLede(facts)),
            url: absoluteUrl(r.canonical),
            inLanguage: "en-AU",
            educationalLevel: u.undergradPostgrad ?? undefined,
            numberOfCredits: u.creditPoints || undefined,
            provider: {
              "@type": "CollegeOrUniversity",
              name: "Monash University",
              sameAs: "https://www.monash.edu/",
            },
            sameAs: monashHandbookUrl("unit", u.code, r.year),
            coursePrerequisites: facts.prerequisites
              ? plain(ruleSegs(facts.prerequisites) ?? [])
              : undefined,
            hasCourseInstance: courseInstancesLd(u, facts.workloadHours),
            ...ratingLd(reviews.summary, reviews.reviews),
          },
          breadcrumbLd([
            { name: "Search", path: "/search" },
            { name: "Units", path: "/search" },
            { name: `${u.code} ${u.title}`, path: r.canonical },
          ]),
        ]}
      />
    </HandbookMain>
  )
}

/** One schema.org CourseInstance per teaching period and campus. */
function courseInstancesLd(u: UnitPageData, hours: number | null) {
  const seen = new Set<string>()
  const out: object[] = []
  for (const o of u.offerings) {
    const key = `${o.teachingPeriod}|${o.location}|${o.attendanceModeCode}`
    if (seen.has(key) || out.length >= 12) continue
    seen.add(key)
    out.push({
      "@type": "CourseInstance",
      name: `${o.teachingPeriod} ${u.year}`,
      courseMode:
        o.attendanceModeCode === "ONLINE"
          ? "Online"
          : o.attendanceModeCode === "BLENDED"
            ? "Blended"
            : "Onsite",
      location: o.location ?? undefined,
      // ISO 8601 total for the semester, when the handbook gives one.
      courseWorkload: hours ? `PT${hours}H` : undefined,
    })
  }
  return out.length ? out : undefined
}

/** "After" list: the first eight, then the rest behind a toggle. */
function UnlockList({
  u,
  linkable,
  linkYear,
}: {
  u: UnitPageData
  linkable: ReadonlySet<string>
  linkYear: string | null
}) {
  const rows = u.unlocks.map((x) => ({
    kind: "unit" as const,
    code: x.code,
    title: u.titles[x.code] ?? null,
    note: x.type === "corequisite" ? "Coreq" : null,
    linkable: linkable.has(x.code),
  }))
  if (rows.length <= 8) return <EntityRows rows={rows} linkYear={linkYear} />
  return (
    <div className="flex flex-col gap-2">
      <EntityRows rows={rows.slice(0, 8)} linkYear={linkYear} />
      <details className="group">
        <summary className="cursor-pointer text-sm text-info-foreground underline-offset-2 group-open:mb-2 hover:underline">
          Show {rows.length - 8} more
        </summary>
        <EntityRows rows={rows.slice(8)} linkYear={linkYear} />
      </details>
    </div>
  )
}
