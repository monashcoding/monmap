"use client"

import { XIcon } from "lucide-react"

export interface ActiveChip {
  key: string
  label: string
  remove: () => void
}

export function ActiveFilterChips({
  chips,
  onClearAll,
}: {
  chips: ActiveChip[]
  onClearAll: () => void
}) {
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.remove}
          className="inline-flex items-center gap-1 rounded-full bg-primary/40 px-2 py-0.5 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/60"
          aria-label={`Remove filter: ${chip.label}`}
        >
          {chip.label}
          <XIcon className="size-3 opacity-70" />
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="px-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          Clear all
        </button>
      )}
    </div>
  )
}
