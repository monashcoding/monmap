"use client"

import { ChevronDownIcon } from "lucide-react"
import { useState } from "react"

import { cn } from "@/lib/utils"

/**
 * Hides its content behind a toggle below the `lg` breakpoint and
 * always shows it from `lg` up. The content stays in the HTML either
 * way.
 */
export function MobileCollapsible({
  label,
  badge,
  className,
  children,
}: {
  label: string
  badge?: number
  className?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-panel border bg-card px-4 py-3 text-sm font-medium shadow-card lg:hidden"
      >
        <span className="flex items-center gap-2">
          {label}
          {badge ? (
            <span className="rounded-full bg-primary/40 px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
              {badge}
            </span>
          ) : null}
        </span>
        <ChevronDownIcon
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
      </button>
      <div className={cn("mt-3 lg:mt-0 lg:block", open ? "block" : "hidden")}>
        {children}
      </div>
    </div>
  )
}
