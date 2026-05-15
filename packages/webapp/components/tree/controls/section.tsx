"use client"

import { cn } from "@/lib/utils"

/**
 * Visual wrapper used by every control section in the Tree sidebar.
 * Compact card with an uppercase eyebrow label.
 */
export function ControlSection({
  title,
  className,
  children,
}: {
  title: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border bg-card p-3 shadow-card sm:rounded-3xl",
        className
      )}
    >
      <div className="px-1 pb-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </div>
      {children}
    </section>
  )
}
