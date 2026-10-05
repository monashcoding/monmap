import Link from "next/link"
import { MapIcon, MessageSquareTextIcon, NetworkIcon } from "lucide-react"

import { EntityRows } from "@/components/handbook/parts"
import { listPopularCourses } from "@/lib/db/handbook"

const FEATURES = [
  {
    icon: MapIcon,
    title: "Plan your degree",
    text: "Drag units into semesters. MonMap checks prerequisites and offerings as you go, counts credit points against your course's requirements and tracks your WAM.",
  },
  {
    icon: MessageSquareTextIcon,
    title: "Read student reviews",
    text: "Every unit, course, major and minor has ratings from Monash students: teaching, content, assessment, difficulty and workload, with written reviews.",
  },
  {
    icon: NetworkIcon,
    title: "See how units connect",
    text: "Requisite maps show what each unit needs and everything it unlocks, so you can see the path to the units you want in later years.",
  },
]

/**
 * What MonMap is, under the planner: the page's crawlable content and
 * its links into the course, major and unit pages. The planner itself
 * renders nothing a search engine can read before a course is picked.
 */
export async function HomeAbout() {
  const popular = await listPopularCourses(12).catch(() => [])
  return (
    <section
      aria-labelledby="about-monmap"
      className="flex flex-col gap-6 rounded-panel border bg-card p-5 shadow-card sm:p-7"
    >
      <div className="flex flex-col gap-1">
        <h2 id="about-monmap" className="text-xl font-semibold">
          The Monash course planner with unit reviews
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          MonMap is a free, open-source planner for Monash University students,
          built by the Monash Association of Coding. It uses the official
          handbook from 2020 to 2027.
        </p>
      </div>

      <ul className="grid gap-4 md:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex flex-col gap-2">
            <span className="flex size-8 items-center justify-center rounded-control bg-primary text-primary-foreground">
              <Icon className="size-4" strokeWidth={2.25} aria-hidden />
            </span>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {text}
            </p>
          </li>
        ))}
      </ul>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {popular.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">
              Courses students plan most
            </h3>
            <EntityRows
              rows={popular.map((c) => ({
                kind: "course" as const,
                code: c.code,
                title: c.title,
              }))}
              linkYear={null}
            />
          </div>
        ) : null}
        <nav aria-label="Browse" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Browse the handbook</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {[
              { href: "/courses", label: "All Monash courses" },
              { href: "/aos", label: "Majors, minors and specialisations" },
              { href: "/search?type=units", label: "Search every unit" },
              { href: "/my-reviews", label: "Review the units you've taken" },
            ].map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="font-medium text-info-foreground underline-offset-2 hover:underline"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  )
}
