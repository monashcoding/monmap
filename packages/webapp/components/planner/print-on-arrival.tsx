"use client"

import { useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { usePlanner } from "./planner-context"

/**
 * Opens the print dialog when the planner is reached with ?print=1,
 * which is how the plans page's Print button works: the print layout
 * needs the planner's unit data, so it prints here once every planned
 * unit has loaded, or after 15 seconds if some never do. The
 * parameter is dropped first so a reload doesn't print again.
 */
export function PrintOnArrival() {
  const wanted = useSearchParams().get("print") === "1"
  const { units, plannedCodes } = usePlanner()
  const [timedOut, setTimedOut] = useState(false)
  const printed = useRef(false)
  const ready = [...plannedCodes].every((c) => units.has(c))

  useEffect(() => {
    if (!wanted) return
    const t = setTimeout(() => setTimedOut(true), 15000)
    return () => clearTimeout(t)
  }, [wanted])

  useEffect(() => {
    if (!wanted || printed.current || !(ready || timedOut)) return
    printed.current = true
    const url = new URL(window.location.href)
    url.searchParams.delete("print")
    window.history.replaceState(null, "", url)
    // Let the print sheet paint with the loaded data first.
    requestAnimationFrame(() => window.print())
  }, [wanted, ready, timedOut])

  return null
}
