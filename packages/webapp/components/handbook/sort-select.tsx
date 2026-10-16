"use client"

import { useRouter } from "next/navigation"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { SearchSort } from "@/lib/handbook/search-url"

export const SORT_LABEL: Record<SearchSort, string> = {
  default: "Default",
  alpha: "A to Z",
  rating: "Highest rated",
  lowest: "Lowest rated",
  easiest: "Easiest first",
  reviews: "Most reviews",
  planned: "Most planned",
}

/** Pick the /search order; each order is its own URL. */
export function SortSelect({
  value,
  options,
}: {
  value: SearchSort
  options: Array<{ sort: SearchSort; href: string }>
}) {
  const router = useRouter()
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const target = options.find((o) => o.sort === v)
        if (target) router.push(target.href, { scroll: false })
      }}
    >
      <SelectTrigger
        aria-label="Sort results"
        size="sm"
        className="min-w-[150px]"
      >
        <SelectValue>
          {(v: unknown) => `Sort: ${SORT_LABEL[(v as SearchSort) ?? value]}`}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((o) => (
            <SelectItem key={o.sort} value={o.sort}>
              {SORT_LABEL[o.sort]}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
