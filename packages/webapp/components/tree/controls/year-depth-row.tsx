"use client"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/**
 * Year-only row. Depth used to live here too but it added a confusing
 * knob with no good default — fixed at 4 everywhere now (see the
 * server-side closure expanders). Filename kept for import stability.
 */
export function YearDepthRow({
  year,
  availableYears,
  onYearChange,
}: {
  year: string
  availableYears: string[]
  onYearChange: (y: string) => void
}) {
  return (
    <div className="flex flex-col gap-2 border-t pt-2.5">
      <div className="flex items-center gap-2">
        <span className="w-12 shrink-0 text-[11px] text-muted-foreground">
          Year
        </span>
        <Select value={year} onValueChange={(v) => onYearChange(String(v))}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {availableYears.map((y) => (
                <SelectItem key={y} value={y}>
                  Handbook {y}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
