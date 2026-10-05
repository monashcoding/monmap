import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import Link from "next/link"

import { cn } from "@/lib/utils"

/**
 * Page links for a paged list: the first and last pages, two either
 * side of the current one, and Previous / Next.
 */
export function Pagination({
  page: current,
  pageCount,
  href,
}: {
  page: number
  pageCount: number
  href: (page: number) => string
}) {
  const pages = new Set<number>([1, pageCount])
  for (let p = current - 2; p <= current + 2; p++)
    if (p > 1 && p < pageCount) pages.add(p)
  const sorted = [...pages].sort((a, b) => a - b)
  const btn =
    "inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-control border bg-card px-3 text-sm hover:border-ring"
  return (
    <nav
      aria-label="Pages"
      className="flex flex-wrap items-center justify-center gap-1.5 pt-2"
    >
      {current > 1 ? (
        <Link href={href(current - 1)} rel="prev" className={btn}>
          <ChevronLeftIcon className="size-4" />
          Previous
        </Link>
      ) : null}
      {sorted.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && p - sorted[i - 1] > 1 ? (
            <span className="px-1 text-muted-foreground" aria-hidden>
              ...
            </span>
          ) : null}
          {p === current ? (
            <span
              aria-current="page"
              className={cn(btn, "border-emphasis font-semibold")}
            >
              {p}
            </span>
          ) : (
            <Link href={href(p)} className={btn}>
              {p}
            </Link>
          )}
        </span>
      ))}
      {current < pageCount ? (
        <Link href={href(current + 1)} rel="next" className={btn}>
          Next
          <ChevronRightIcon className="size-4" />
        </Link>
      ) : null}
    </nav>
  )
}
