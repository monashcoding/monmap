import { ImageResponse } from "next/og"

import {
  AOS_KIND_LABEL,
  fetchAosPage,
  fetchCoursePage,
  fetchUnitPage,
  listEntityYears,
} from "./db/handbook.ts"
import { ENTITY_LABEL, type EntityKind } from "./handbook/links.ts"
import { loadOgAssets, OG_SIZE, OgShell } from "./og.tsx"

/**
 * The share card for a unit, course or area of study page, from the
 * code's latest handbook year. Links unfurl in Discord, Reddit and
 * Slack with the code, title and key facts instead of the site card.
 */
export async function entityOgImage(
  kind: EntityKind,
  rawCode: string
): Promise<ImageResponse> {
  const code = decodeURIComponent(rawCode).toUpperCase()
  const year = (await listEntityYears(kind, code)).at(-1)
  let eyebrow = `${code} | ${ENTITY_LABEL[kind]}`
  let title = "Not in the Monash handbook"
  let facts: Array<string | null | undefined> = []

  if (year && kind === "unit") {
    const u = await fetchUnitPage(code, year)
    if (u) {
      title = u.title
      facts = [`${u.creditPoints} credit points`, u.level, u.school]
    }
  } else if (year && kind === "course") {
    const c = await fetchCoursePage(code, year)
    if (c) {
      title = c.title
      facts = [
        `${c.creditPoints} credit points`,
        c.fullTime && `${c.fullTime} full time`,
        c.school,
      ]
    }
  } else if (year && kind === "aos") {
    const a = await fetchAosPage(code, year)
    if (a) {
      title = a.title
      eyebrow = `${code} | ${a.kind ? AOS_KIND_LABEL[a.kind] : ENTITY_LABEL.aos}`
      facts = [
        a.studyLevel,
        a.creditPoints ? `${a.creditPoints} credit points` : null,
        a.school,
      ]
    }
  }

  const assets = await loadOgAssets()
  return new ImageResponse(
    OgShell({
      logoDataUrl: assets.logoDataUrl,
      eyebrow,
      title,
      subtitle: facts.filter(Boolean).join(" | ") || undefined,
      chips: [
        {
          label: kind === "unit" ? "Requisite map" : "Structure and units",
          filled: true,
        },
        { label: "MonMap - Monash course planner" },
      ],
    }),
    { ...OG_SIZE, fonts: assets.fonts.map((f) => ({ ...f })) }
  )
}
