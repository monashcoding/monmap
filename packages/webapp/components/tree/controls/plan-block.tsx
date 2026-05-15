"use client"

import { ControlSection } from "./section"

export function PlanBlock({
  enabled,
  onEnabledChange,
}: {
  enabled: boolean
  onEnabledChange: (b: boolean) => void
}) {
  return (
    <ControlSection title="My plan">
      <label className="flex cursor-pointer items-start gap-2 px-0.5 py-0.5">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          className="mt-0.5 size-4 accent-[var(--monash-purple)]"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-xs font-medium">Use my saved plan</span>
          <span className="text-[10px] leading-tight text-muted-foreground">
            Highlight units already in your plan; surface what&apos;s one prereq
            away.
          </span>
        </span>
      </label>
    </ControlSection>
  )
}
