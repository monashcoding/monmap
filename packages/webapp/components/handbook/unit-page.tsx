import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { fetchUnitPage, type UnitPageData } from "@/lib/db/handbook"
import { entityHref, monashHandbookUrl } from "@/lib/handbook/links"
import { resolveEntity } from "@/lib/handbook/resolve"
import { PERIOD_KIND_LABEL } from "@/lib/planner/teaching-period"
import { absoluteUrl, stripHtml, truncate } from "@/lib/seo"
import { prefetchTreeData } from "@/lib/tree/prefetch"

import { EntityGraph } from "./entity-graph"
import { JsonLd, breadcrumbLd } from "./json-ld"
import {
  DetailColumns,
  EntityHero,
  EntityRows,
  FactList,
  HandbookMain,
  Notice,
  Prose,
  RequisiteRules,
  Section,
  SectionNav,
  SubHeading,
  YearLinks,
} from "./parts"

function levelNumber(level: string | null): string | null {
  return level?.match(/\d+/)?.[0] ?? null
}

function periodSummary(u: UnitPageData): string | null {
  const kinds = [...new Set(u.offerings.map((o) => o.periodKind))].filter(
    (k) => k !== "OTHER"
  )
  return kinds.length ? kinds.map((k) => PERIOD_KIND_LABEL[k]).join(", ") : null
}

export async function unitMetadata(
  rawCode: string,
  rawYear: string | null
): Promise<Metadata> {
  const r = await resolveEntity("unit", rawCode, rawYear)
  const u = await fetchUnitPage(r.code, r.year)
  if (!u) return { title: r.code, robots: { index: false } }
  const yearNote = r.linkYear ? ` (${r.year})` : ""
  const facts = [
    `${u.creditPoints} credit points`,
    u.level,
    u.undergradPostgrad,
    periodSummary(u) ? `offered ${periodSummary(u)}` : null,
  ]
    .filter(Boolean)
    .join(", ")
  const description = truncate(
    `${u.code} ${u.title} at Monash University${yearNote}: ${facts}. ${stripHtml(u.synopsis)}`,
    160
  )
  const title = `${u.code} ${u.title}${yearNote}`
  return {
    title,
    description,
    alternates: { canonical: r.canonical },
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
  const [u, graph] = await Promise.all([
    fetchUnitPage(r.code, r.year),
    prefetchTreeData({
      mode: "unit",
      unitCode: r.code,
      courseCode: null,
      aosCode: null,
      direction: "both",
      year: r.year,
      useMyPlan: false,
    }),
  ])
  if (!u) notFound()

  const { linkYear } = r
  const linkable = new Set(u.linkable)
  const yearHref = (y: string) =>
    entityHref("unit", u.code, y === r.latest ? null : y)
  const lvl = levelNumber(u.level)

  const hasRequisites = u.requisites.length > 0 || u.enrolmentRules.length > 0
  const hasDelivery =
    u.workload != null ||
    u.activities.length > 0 ||
    u.teachingApproaches.length > 0

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
        facts={[
          `${u.creditPoints} credit points`,
          u.level,
          u.undergradPostgrad,
          periodSummary(u),
        ]}
        subtitle={u.school}
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
        notice={notice}
      />

      <SectionNav
        items={[
          u.synopsis ? { id: "synopsis", label: "Synopsis" } : null,
          hasRequisites ? { id: "requisites", label: "Requisites" } : null,
          u.offerings.length > 0
            ? { id: "offerings", label: "Offerings" }
            : null,
          u.learningOutcomes.length > 0
            ? { id: "outcomes", label: "Learning outcomes" }
            : null,
          u.assessments.length > 0
            ? { id: "assessment", label: "Assessment" }
            : null,
          hasDelivery ? { id: "workload", label: "Workload" } : null,
          u.resources.length > 0
            ? { id: "resources", label: "Resources" }
            : null,
        ]}
      />

      <EntityGraph
        initial={graph}
        year={r.year}
        linkYear={linkYear}
        title="Requisite map"
        subtitle={`What ${u.code} needs and what it leads to. Click a unit to see its details.`}
        emptyText={`${u.code} has no prerequisites or corequisites, and no unit lists it as one, in the ${r.year} handbook.`}
      />

      <DetailColumns
        main={
          <>
            {u.synopsis ? (
              <Section id="synopsis" title="Synopsis">
                <Prose html={u.synopsis} linkYear={linkYear} />
              </Section>
            ) : null}

            {hasRequisites ? (
              <Section id="requisites" title="Requisites">
                {u.requisites.length > 0 ? (
                  <RequisiteRules
                    blocks={u.requisites}
                    titles={u.titles}
                    linkable={linkable}
                    linkYear={linkYear}
                  />
                ) : null}
                {u.enrolmentRules.length > 0 ? (
                  <>
                    <SubHeading>Enrolment rules</SubHeading>
                    <div className="flex flex-col gap-3">
                      {u.enrolmentRules.map((html, i) => (
                        <Prose
                          key={i}
                          html={html}
                          linkYear={linkYear}
                          className="rounded-control bg-muted/50 px-3.5 py-3"
                        />
                      ))}
                    </div>
                  </>
                ) : null}
              </Section>
            ) : null}

            {u.learningOutcomes.length > 0 ? (
              <Section id="outcomes" title="Learning outcomes">
                <p className="mb-3 text-sm text-muted-foreground">
                  On successful completion of this unit, you should be able to:
                </p>
                <ol className="flex flex-col gap-2">
                  {u.learningOutcomes.map((o, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="w-12 shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">
                        {o.code ?? `${i + 1}`}
                      </span>
                      <Prose html={o.html} linkYear={linkYear} />
                    </li>
                  ))}
                </ol>
              </Section>
            ) : null}

            {u.assessments.length > 0 ? (
              <Section id="assessment" title="Assessment">
                <div className="overflow-x-auto rounded-control border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Task</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 text-right font-medium">
                          Value
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {u.assessments.map((a, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2">
                            {a.name}
                            {a.hurdle ? (
                              <span className="ml-2 rounded-tag bg-primary/40 px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                                {a.hurdle} hurdle
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {a.type ?? "-"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {a.weight != null ? `${a.weight}%` : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {u.assessmentNote ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {u.assessmentNote}
                  </p>
                ) : null}
              </Section>
            ) : null}

            {hasDelivery ? (
              <Section id="workload" title="Workload and teaching">
                {u.workload ? (
                  <Prose html={u.workload} linkYear={linkYear} />
                ) : null}
                {u.activities.length > 0 ? (
                  <>
                    <SubHeading>Scheduled activities</SubHeading>
                    <FactList
                      rows={u.activities.map((a) => ({
                        label: a.type,
                        value: a.duration ?? "-",
                      }))}
                    />
                  </>
                ) : null}
                {u.teachingApproaches.length > 0 ? (
                  <>
                    <SubHeading>Teaching approach</SubHeading>
                    <ul className="flex flex-col gap-2 text-sm">
                      {u.teachingApproaches.map((t, i) => (
                        <li key={i}>
                          <span className="font-medium">{t.label}</span>
                          {t.html ? (
                            <Prose
                              html={t.html}
                              linkYear={linkYear}
                              className="mt-1 text-muted-foreground"
                            />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </Section>
            ) : null}

            {u.resources.length > 0 ? (
              <Section id="resources" title="Learning resources">
                {u.resources.map((g) => (
                  <div key={g.type}>
                    <SubHeading>{g.type}</SubHeading>
                    <div className="flex flex-col gap-2">
                      {g.items.map((html, i) => (
                        <Prose key={i} html={html} linkYear={linkYear} />
                      ))}
                    </div>
                  </div>
                ))}
              </Section>
            ) : null}
          </>
        }
        aside={
          <>
            <Section title="Unit details">
              <FactList
                rows={[
                  { label: "Credit points", value: u.creditPoints },
                  u.level
                    ? {
                        label: "Level",
                        value: u.level.replace(/^Level\s+/i, ""),
                      }
                    : null,
                  u.undergradPostgrad
                    ? { label: "Study level", value: u.undergradPostgrad }
                    : null,
                  u.school ? { label: "Faculty", value: u.school } : null,
                  u.academicOrg && u.academicOrg !== u.school
                    ? { label: "Organisational unit", value: u.academicOrg }
                    : null,
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
            </Section>

            {u.offerings.length > 0 ? (
              <Section id="offerings" title={`Offerings in ${r.year}`}>
                <ul className="flex flex-col divide-y rounded-control border text-sm">
                  {u.offerings.map((o, i) => (
                    <li key={i} className="flex flex-col gap-0.5 px-3 py-2">
                      <span className="font-medium">{o.teachingPeriod}</span>
                      <span className="text-xs text-muted-foreground">
                        {[
                          o.location,
                          o.attendanceModeCode
                            ?.toLowerCase()
                            .replace(/-/g, " "),
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : (
              <Section id="offerings" title={`Offerings in ${r.year}`}>
                <p className="text-sm text-muted-foreground">
                  The {r.year} handbook lists no offerings for {u.code}.
                </p>
              </Section>
            )}

            {u.unlocks.length > 0 ? (
              <Section title={`Leads to (${u.unlocks.length})`}>
                <p className="mb-3 text-xs text-muted-foreground">
                  Units that list {u.code} as a prerequisite or corequisite.
                </p>
                <EntityRows
                  rows={u.unlocks.map((x) => ({
                    kind: "unit" as const,
                    code: x.code,
                    title: u.titles[x.code] ?? null,
                    note: x.type === "corequisite" ? "Coreq" : null,
                    linkable: linkable.has(x.code),
                  }))}
                  linkYear={linkYear}
                />
              </Section>
            ) : null}

            {u.equivalents.length > 0 ? (
              <Section title="Equivalent units">
                <p className="mb-3 text-xs text-muted-foreground">
                  Same content under another code. You can count only one of
                  them.
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
              </Section>
            ) : null}

            {u.areasOfStudy.length > 0 ? (
              <Section title="Part of these areas of study">
                <EntityRows
                  rows={u.areasOfStudy.map((a) => ({
                    kind: "aos" as const,
                    code: a.code,
                    title: a.title,
                  }))}
                  linkYear={linkYear}
                />
              </Section>
            ) : null}

            {u.contacts.length > 0 ? (
              <Section title="Contacts">
                <FactList
                  rows={u.contacts.map((c) => ({
                    label: c.role.replace(/\(s\)$/, "s"),
                    value: (
                      <span className="flex flex-col">
                        {c.names.map((n) => (
                          <span key={n}>{n}</span>
                        ))}
                      </span>
                    ),
                  }))}
                />
              </Section>
            ) : null}
          </>
        }
      />

      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Course",
            name: `${u.code} ${u.title}`,
            courseCode: u.code,
            description: truncate(stripHtml(u.synopsis), 500) || undefined,
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
          },
          breadcrumbLd([
            { name: "Search", path: "/search" },
            { name: "Units", path: "/search?type=units" },
            { name: `${u.code} ${u.title}`, path: r.canonical },
          ]),
        ]}
      />
    </HandbookMain>
  )
}
