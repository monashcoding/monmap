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

/** Pick a handbook year; each year is its own page. */
export function YearSelect({
  value,
  options,
}: {
  value: string
  options: Array<{ year: string; href: string }>
}) {
  const router = useRouter()
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const target = options.find((o) => o.year === v)
        if (target) router.push(target.href)
      }}
    >
      <SelectTrigger aria-label="Handbook year" className="min-w-[150px]">
        <SelectValue>
          {(v: unknown) => `${String(v ?? value)} handbook`}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((o) => (
            <SelectItem key={o.year} value={o.year}>
              {o.year} handbook
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
