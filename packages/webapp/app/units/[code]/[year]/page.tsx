import type { Metadata } from "next"

import { UnitPage, unitMetadata } from "@/components/handbook/unit-page"

// Same caching as the latest-year page; see ../page.tsx.
export const revalidate = 86400
export function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ code: string; year: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code, year } = await params
  return unitMetadata(code, year)
}

export default async function Page({ params }: Props) {
  const { code, year } = await params
  return <UnitPage rawCode={code} rawYear={year} />
}
