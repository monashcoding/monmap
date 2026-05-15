"use client"

import { ChevronDownIcon } from "lucide-react"
import { useState } from "react"

import { cn } from "@/lib/utils"

/**
 * Header + body wrapper for a results group ("Search results",
 * "Suggested from your course", …). Optional collapse toggle.
 */
export function ResultSection({
  title,
  count,
  collapsible,
  children,
}: {
  title: string
  count: number | null
  collapsible?: boolean
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const showToggle = collapsible === true
  return (
    <div className="flex flex-col gap-1">
      {showToggle ? (
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="-mx-1 flex items-center justify-between rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/40"
        >
          <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            {title}
          </p>
          <ChevronDownIcon
            className={cn(
              "size-3.5 text-muted-foreground transition-transform",
              collapsed && "-rotate-90"
            )}
          />
        </button>
      ) : (
        <div className="flex items-center justify-between px-1">
          <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            {title}
          </p>
          {count !== null && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {count}
            </span>
          )}
        </div>
      )}
      {!(showToggle && collapsed) && (
        <div className="flex flex-col gap-0.5">{children}</div>
      )}
    </div>
  )
}

export function EmptyResultState({
  message,
  action,
}: {
  message: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center">
      <p className="text-xs text-muted-foreground">{message}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="rounded-full bg-primary/40 px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/60"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
