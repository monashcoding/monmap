import type { Metadata } from "next"

import { AosPage, aosMetadata } from "@/components/handbook/aos-page"

// Same caching as the latest-year page; see ../page.tsx.
export const revalidate = 604800
export const dynamicParams = true
export function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ code: string; year: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code, year } = await params
  return aosMetadata(code, year)
}

export default async function Page({ params }: Props) {
  const { code, year } = await params
  return <AosPage rawCode={code} rawYear={year} />
}
