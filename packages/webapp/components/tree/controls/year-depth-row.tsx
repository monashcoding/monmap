"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"

export function YearDepthRow({
  year,
  depth,
  availableYears,
  onYearChange,
  onDepthChange,
}: {
  year: string
  depth: number
  availableYears: string[]
  onYearChange: (y: string) => void
  onDepthChange: (d: number) => void
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
            {availableYears.map((y) => (
              <SelectItem key={y} value={y}>
                Handbook {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-12 shrink-0 text-[11px] text-muted-foreground">
          Depth
        </span>
        <Slider
          className="flex-1"
          min={1}
          max={5}
          step={1}
          value={[depth]}
          onValueChange={(v) =>
            onDepthChange(Array.isArray(v) ? v[0] : (v as number))
          }
        />
        <span className="w-6 shrink-0 text-right text-[11px] font-semibold tabular-nums">
          {depth}
        </span>
      </div>
    </div>
  )
}
