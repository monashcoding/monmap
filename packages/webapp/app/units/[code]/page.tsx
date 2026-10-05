import type { Metadata } from "next"

import { UnitPage, unitMetadata } from "@/components/handbook/unit-page"

// Rendered on first visit, then cached for a day (ISR); see
// components/handbook/entity-page.tsx.
export const revalidate = 86400
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
