import { entityOgImage } from "@/lib/og-entity"
import { OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og"

export const alt = "MonMap course page"
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
// Cached on first request like the page itself; the build renders none.
export const revalidate = 604800
export function generateStaticParams() {
  return []
}

export default async function Image({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  return entityOgImage("course", code)
}
