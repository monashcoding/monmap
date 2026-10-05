import type { Metadata } from "next"

import { CoursePage, courseMetadata } from "@/components/handbook/course-page"

// Same caching as the latest-year page; see ../page.tsx.
export const revalidate = 86400
export const dynamicParams = true
export function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ code: string; year: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code, year } = await params
  return courseMetadata(code, year)
}

export default async function Page({ params }: Props) {
  const { code, year } = await params
  return <CoursePage rawCode={code} rawYear={year} />
}
