import type { Metadata } from "next"

import { HubPage, type HubGroup } from "@/components/handbook/hub-page"
import { AOS_KIND_LABEL, listCurrentAos } from "@/lib/db/handbook"
import { listAvailableYears } from "@/lib/db/queries"

// Rendered per request (the build has no database); the list query is
// memoised in process.
export const dynamic = "force-dynamic"

const DESCRIPTION =
  "Every current Monash University major, minor and specialisation, with student ratings. Open one for its reviews, units, requisite map and the courses that offer it."

export const metadata: Metadata = {
  title: "Monash Majors, Minors & Specialisations: Reviews & Units",
  description: DESCRIPTION,
  alternates: { canonical: "/aos" },
  openGraph: {
    title: "Monash Majors, Minors & Specialisations: Reviews & Units",
    description: DESCRIPTION,
    url: "/aos",
  },
}

const GROUPS: Array<{ kind: string; label: string }> = [
  { kind: "major", label: "Majors" },
  { kind: "extended_major", label: "Extended majors" },
  { kind: "minor", label: "Minors" },
  { kind: "specialisation", label: "Specialisations" },
  { kind: "elective", label: "Elective streams" },
  { kind: "other", label: "Other areas of study" },
]

export default async function AosHub() {
  const [aos, years] = await Promise.all([
    listCurrentAos(),
    listAvailableYears(),
  ])
  const groups: HubGroup[] = GROUPS.map(({ kind, label }) => ({
    id: kind.replace("_", "-"),
    label,
    rows: aos
      .filter((a) =>
        kind === "other"
          ? !a.group || !(a.group in AOS_KIND_LABEL) || a.group === "other"
          : a.group === kind
      )
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((a) => ({
        kind: "aos" as const,
        code: a.code,
        title: a.title,
        note: a.school?.replace(/^Faculty of /, "") ?? null,
      })),
  }))
  return (
    <HubPage
      year={years.at(-1) ?? "2027"}
      title="Monash majors, minors and specialisations"
      crumb="Areas of study"
      path="/aos"
      intro={`All ${aos.length.toLocaleString("en-AU")} current areas of study at Monash University, with student ratings. Open one for its reviews, its units and requisite map, and the courses you can take it in.`}
      groups={groups}
    />
  )
}
