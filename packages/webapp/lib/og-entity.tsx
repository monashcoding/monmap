import { notFound } from "next/navigation"
import { ImageResponse } from "next/og"

import {
  fetchAosPage,
  fetchCoursePage,
  fetchUnitPage,
  listEntityYears,
} from "./db/handbook.ts"
import { aosKindLabel } from "./handbook/kinds.ts"
import {
  ENTITY_LABEL,
  parseEntityUrl,
  type EntityKind,
} from "./handbook/links.ts"
import { loadOgAssets, OG_SIZE, OgShell } from "./og.tsx"

/**
 * The share card for a unit, course or area of study page, from the
 * code's latest handbook year. Links unfurl in Discord, Reddit and
 * Slack with the code, title and key facts instead of the site card.
 *
 * A code that isn't in the handbook is a 404, like its page, so junk
 * URLs don't each cost an image render and a week in the cache. The
 * format check runs first, so they don't reach the database either.
 */
export async function entityOgImage(
  kind: EntityKind,
  rawCode: string
): Promise<ImageResponse> {
  const route = parseEntityUrl(kind, rawCode, null)
  // A lowercase code redirects on its page, so only the uppercase card
  // is ever linked; serving both would cache two copies.
  if (route.action !== "ok") notFound()
  const { code } = route
  const year = (await listEntityYears(kind, code)).at(-1)
  if (!year) notFound()
  let eyebrow = `${code} | ${ENTITY_LABEL[kind]}`
  let title = "Not in the Monash handbook"
  let facts: Array<string | null | undefined> = []

  if (kind === "unit") {
    const u = await fetchUnitPage(code, year)
    if (u) {
      title = u.title
      facts = [`${u.creditPoints} credit points`, u.level, u.school]
    }
  } else if (kind === "course") {
    const c = await fetchCoursePage(code, year)
    if (c) {
      title = c.title
      facts = [
        `${c.creditPoints} credit points`,
        c.fullTime && `${c.fullTime} full time`,
        c.school,
      ]
    }
  } else {
    const a = await fetchAosPage(code, year)
    if (a) {
      title = a.title
      eyebrow = `${code} | ${aosKindLabel(a.kind)}`
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
