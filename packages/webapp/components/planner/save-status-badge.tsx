"use client"

import { CheckIcon, CloudIcon, TriangleAlertIcon } from "lucide-react"

import { usePlannerSync } from "./planner-context"

/**
 * Reads the planner's save state and renders a compact status pill
 * intended to live next to the avatar in <AppHeader>.
 * Anonymous users see nothing (their state is local-only; the
 * anonymous banner in the action rail communicates that).
 */
export function SaveStatusBadge() {
  // Anonymous plans are always "local", which renders nothing.
  const { saveStatus } = usePlannerSync()

  if (saveStatus === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <CloudIcon className="size-3.5 animate-pulse" />
        saving…
      </span>
    )
  }
  if (saveStatus === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <CheckIcon className="size-3.5 text-success" />
        saved
      </span>
    )
  }
  if (saveStatus === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-warning-foreground">
        <TriangleAlertIcon className="size-3.5" />
        save failed - will retry
      </span>
    )
  }
  return null
}
