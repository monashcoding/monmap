"use client"

import { cn } from "@/lib/utils"

import { ControlSection } from "./section"

export function Legend() {
  return (
    <ControlSection title="Legend">
      <ul className="flex flex-col gap-1.5 text-[11px]">
        <li className="flex items-center gap-2">
          <Swatch className="bg-[var(--monash-purple-soft)] ring-1 ring-primary/40" />
          Seed (the unit / major you picked)
        </li>
        <li className="flex items-center gap-2">
          <Swatch className="bg-background ring-1 ring-emerald-500/50" />
          In your plan
        </li>
        <li className="flex items-center gap-2">
          <SwatchLine className="bg-muted-foreground/50" />
          Prerequisite
        </li>
        <li className="flex items-center gap-2">
          <SwatchLine className="border-t border-dashed border-muted-foreground/60" />
          Corequisite
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden>🔒</span>
          Has enrolment-rule gate (course-locked, permission, WAM, …)
        </li>
      </ul>
    </ControlSection>
  )
}

function Swatch({ className }: { className: string }) {
  return (
    <span className={cn("inline-block size-3 rounded-md border", className)} />
  )
}

function SwatchLine({ className }: { className: string }) {
  return <span className={cn("inline-block h-px w-6", className)} />
}
