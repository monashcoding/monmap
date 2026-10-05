import Link from "next/link"

import { JsonLd, breadcrumbLd } from "./json-ld"
import {
  Breadcrumbs,
  DetailLayout,
  EntityRows,
  type EntityRowData,
  HandbookMain,
  Section,
} from "./parts"

export interface HubGroup {
  id: string
  label: string
  rows: EntityRowData[]
}

/**
 * A browsable list of every current course or area of study, grouped,
 * with ratings. It gives crawlers and students a path to every page
 * without the search box.
 */
export function HubPage({
  year,
  title,
  intro,
  crumb,
  path,
  groups,
}: {
  year: string
  title: string
  intro: React.ReactNode
  crumb: string
  path: string
  groups: HubGroup[]
}) {
  const shown = groups.filter((g) => g.rows.length > 0)
  return (
    <HandbookMain year={year}>
      <header className="flex flex-col gap-4 rounded-panel border bg-card p-5 shadow-card sm:p-7">
        <Breadcrumbs
          items={[{ label: "Search", href: "/search" }, { label: crumb }]}
        />
        <h1 className="text-3xl leading-tight font-semibold sm:text-4xl">
          {title}
        </h1>
        <p className="max-w-3xl text-[15px] leading-relaxed text-foreground/80">
          {intro}
        </p>
        <nav aria-label="Groups" className="flex flex-wrap gap-1.5">
          {shown.map((g) => (
            <Link
              key={g.id}
              href={`#${g.id}`}
              className="rounded-control border bg-card px-3 py-1.5 text-sm hover:bg-muted"
            >
              {g.label}{" "}
              <span className="text-xs text-muted-foreground tabular-nums">
                {g.rows.length}
              </span>
            </Link>
          ))}
        </nav>
      </header>
      <DetailLayout toc={shown.map((g) => ({ id: g.id, label: g.label }))}>
        {shown.map((g) => (
          <Section
            key={g.id}
            id={g.id}
            title={g.label}
            action={
              <span className="text-sm text-muted-foreground tabular-nums">
                {g.rows.length}
              </span>
            }
          >
            <EntityRows rows={g.rows} linkYear={null} />
          </Section>
        ))}
      </DetailLayout>
      <JsonLd data={breadcrumbLd([{ name: crumb, path }])} />
    </HandbookMain>
  )
}
