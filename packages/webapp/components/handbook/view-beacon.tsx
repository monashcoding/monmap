"use client"

import { useEffect } from "react"

import type { EntityKind } from "@/lib/handbook/links"

/**
 * Count one view of this page (app/api/views). It runs in the browser
 * because the page HTML is cached, and crawlers that don't run
 * scripts never send it.
 */
export function ViewBeacon({ kind, code }: { kind: EntityKind; code: string }) {
  useEffect(() => {
    const body = JSON.stringify({ kind, code })
    const sent =
      "sendBeacon" in navigator &&
      navigator.sendBeacon(
        "/api/views",
        new Blob([body], { type: "application/json" })
      )
    if (!sent) {
      fetch("/api/views", { method: "POST", body, keepalive: true }).catch(
        () => {}
      )
    }
  }, [kind, code])
  return null
}
