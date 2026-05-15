"use client"

import type { TreeMode } from "@/lib/tree/types"
import { cn } from "@/lib/utils"

import { ControlSection } from "./section"

const MODES: Array<{ value: TreeMode; label: string; hint: string }> = [
  {
    value: "course",
    label: "Course / major",
    hint: "Show every unit needed to complete a degree path.",
  },
  {
    value: "unit",
    label: "Unit",
    hint: "Centre the graph on one unit's prereqs or downstream.",
  },
]

export function ModeBlock({
  value,
  onModeChange,
}: {
  value: TreeMode
  onModeChange: (m: TreeMode) => void
}) {
  return (
    <ControlSection title="View">
      <div className="grid grid-cols-2 gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => onModeChange(m.value)}
            type="button"
            className={cn(
              "flex flex-col items-start rounded-xl border px-2.5 py-2 text-left transition-colors",
              value === m.value
                ? "border-[var(--monash-purple)] bg-[var(--monash-purple-soft)] text-[var(--monash-purple-deep)]"
                : "border-border bg-background hover:border-muted-foreground/40"
            )}
          >
            <span className="text-xs font-semibold">{m.label}</span>
            <span className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
              {m.hint}
            </span>
          </button>
        ))}
      </div>
    </ControlSection>
  )
}
