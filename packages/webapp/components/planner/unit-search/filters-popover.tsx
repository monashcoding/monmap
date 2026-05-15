"use client"

import { FilterIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  PERIOD_KIND_LABEL,
  PERIOD_KIND_SHORT,
} from "@/lib/planner/teaching-period"
import type { PeriodKind } from "@/lib/planner/types"
import { cn } from "@/lib/utils"

import {
  CAMPUS_OPTIONS,
  CHIP_ACTIVE,
  CHIP_BASE,
  CHIP_IDLE,
  CP_OPTIONS,
  LEVEL_OPTIONS,
  MODE_OPTIONS,
  PERIOD_OPTIONS,
  toggleInSet,
} from "./config"

export interface FiltersValue {
  level: Set<number>
  cp: Set<number>
  period: Set<PeriodKind>
  campus: Set<string>
  mode: Set<string>
}

export function FiltersPopover({
  open,
  onOpenChange,
  value,
  onLevelChange,
  onCpChange,
  onPeriodChange,
  onCampusChange,
  onModeChange,
  onClear,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  value: FiltersValue
  onLevelChange: (next: Set<number>) => void
  onCpChange: (next: Set<number>) => void
  onPeriodChange: (next: Set<PeriodKind>) => void
  onCampusChange: (next: Set<string>) => void
  onModeChange: (next: Set<string>) => void
  onClear: () => void
}) {
  const activeCount =
    value.level.size +
    value.cp.size +
    value.period.size +
    value.campus.size +
    value.mode.size
  const hasActive = activeCount > 0

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button
            size="sm"
            variant={hasActive ? "default" : "outline"}
            className="h-7 gap-1.5 rounded-lg px-2.5 text-xs"
          />
        }
      >
        <FilterIcon className="size-3" />
        Filters
        {hasActive && (
          <span className="flex size-4 items-center justify-center rounded-full bg-primary-foreground/20 text-[10px] leading-none tabular-nums">
            {activeCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[min(280px,calc(100vw-2rem))] p-0"
      >
        <div className="flex items-center justify-between border-b px-4 py-2">
          <p className="text-sm font-semibold">Filters</p>
          {hasActive && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="flex flex-col gap-4 px-4 pt-2.5 pb-4">
          <FilterSection label="Level">
            {LEVEL_OPTIONS.map((lvl) => (
              <Chip
                key={lvl}
                active={value.level.has(lvl)}
                onClick={() => onLevelChange(toggleInSet(value.level, lvl))}
                className="h-8 w-10"
              >
                {lvl}
              </Chip>
            ))}
          </FilterSection>

          <FilterSection label="Credit points">
            {CP_OPTIONS.map((cp) => (
              <Chip
                key={cp}
                active={value.cp.has(cp)}
                onClick={() => onCpChange(toggleInSet(value.cp, cp))}
                className="h-8 px-3"
              >
                {cp}cp
              </Chip>
            ))}
          </FilterSection>

          <FilterSection label="Offered in">
            {PERIOD_OPTIONS.map((p) => (
              <Chip
                key={p}
                active={value.period.has(p)}
                onClick={() => onPeriodChange(toggleInSet(value.period, p))}
                className="h-8 px-3"
                title={PERIOD_KIND_LABEL[p]}
              >
                {PERIOD_KIND_SHORT[p]}
              </Chip>
            ))}
          </FilterSection>

          <FilterSection label="Campus">
            {CAMPUS_OPTIONS.map((campus) => (
              <Chip
                key={campus}
                active={value.campus.has(campus)}
                onClick={() =>
                  onCampusChange(toggleInSet(value.campus, campus))
                }
                className="h-8 px-3"
              >
                {campus}
              </Chip>
            ))}
          </FilterSection>

          <FilterSection label="Mode">
            {MODE_OPTIONS.map(({ code, label }) => (
              <Chip
                key={code}
                active={value.mode.has(code)}
                onClick={() => onModeChange(toggleInSet(value.mode, code))}
                className="h-8 px-3"
              >
                {label}
              </Chip>
            ))}
          </FilterSection>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function FilterSection({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function Chip({
  active,
  onClick,
  className,
  children,
  title,
}: {
  active: boolean
  onClick: () => void
  className?: string
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(CHIP_BASE, active ? CHIP_ACTIVE : CHIP_IDLE, className)}
    >
      {children}
    </button>
  )
}
