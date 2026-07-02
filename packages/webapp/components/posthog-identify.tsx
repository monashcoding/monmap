"use client"

import { useEffect, useRef } from "react"
import posthog from "posthog-js"

import { useSession } from "@/lib/auth-client"

// Bridges the MAC session (via useSession) → PostHog identity. The id is
// the central macUserId. Without this, client captures use the anonymous
// device id while server captures use the real user id, so a signed-in
// user's events never merge into one profile. Mounted once in the root
// layout.
export function PostHogIdentify() {
  const { data, isPending } = useSession()
  const lastIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (isPending) return
    const user = data?.user
    const nextId = user?.id ?? null

    if (nextId === lastIdRef.current) return

    if (nextId) {
      posthog.identify(nextId, {
        email: user!.email,
        name: user!.name,
      })
    } else if (lastIdRef.current) {
      // Was signed in, now signed out — drop the alias.
      posthog.reset()
    }
    lastIdRef.current = nextId
  }, [data, isPending])

  return null
}
