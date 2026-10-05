import { ImageResponse } from "next/og"

import { loadOgAssets, OG_CONTENT_TYPE, OG_SIZE, OgShell } from "@/lib/og"

export const alt = "MonMap - Monash course planner"
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
// Static card, but pin a revalidate so it's CDN-cached rather than
// re-rendered per request (see lib/og.tsx for the fonts fix).
export const revalidate = 86400

export default async function OpengraphImage() {
  const assets = await loadOgAssets()

  return new ImageResponse(
    OgShell({
      logoDataUrl: assets.logoDataUrl,
      title: "MonMap",
      subtitle:
        "Plan your Monash degree visually — drag units into semesters, check prereqs, track your WAM.",
      chips: [
        { label: "Course planner", filled: true },
        { label: "Unit tree" },
        { label: "WAM tracker" },
      ],
    }),
    {
      ...size,
      fonts: assets.fonts.map((f) => ({ ...f })),
    }
  )
}
