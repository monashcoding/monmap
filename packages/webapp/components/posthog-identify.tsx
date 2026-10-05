"use client"

import { useEffect, useRef } from "react"

import { identify, resetIdentity, startAnalytics } from "@/lib/analytics"
import { useSession } from "@/lib/auth-client"

// Starts PostHog and bridges the MAC session (via useSession) to its
// identity. The id is the central macUserId, the same id server-side
// captures use, so a signed-in user's events merge into one profile.
// No email or name goes to PostHog. Mounted once in the root layout.
// lib/analytics.ts skips all of this outside production.
export function PostHogIdentify() {
  const { data, isPending } = useSession()
  const lastIdRef = useRef<string | null>(null)

  useEffect(() => {
    startAnalytics()
  }, [])

  useEffect(() => {
    if (isPending) return
    const nextId = data?.user?.id ?? null
    const lastId = lastIdRef.current
    if (nextId === lastId) return
    lastIdRef.current = nextId

    if (nextId) identify(nextId)
    // Was signed in, now signed out — drop the alias.
    else if (lastId) resetIdentity()
  }, [data, isPending])

  return null
}
