import type { Metadata } from "next"

import { UnitPage, unitMetadata } from "@/components/handbook/unit-page"

// Pages render on first visit and are cached as static HTML for a
// week (ISR). The build renders none of them: it has no database, and
// rendering every code would take far too long. See
// docs/handbook-pages.md for how to warm the cache after a deploy.
export const revalidate = 604800
export const dynamicParams = true
export function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ code: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params
  return unitMetadata(code, null)
}

export default async function Page({ params }: Props) {
  const { code } = await params
  return <UnitPage rawCode={code} rawYear={null} />
}
