"use client"

import { useEffect, useRef } from "react"
import type { PostHog } from "posthog-js"

import { useSession } from "@/lib/auth-client"

let started: Promise<PostHog> | null = null

/**
 * Load and start posthog-js once, when the browser is idle after
 * hydration, so analytics never delays the first interaction. Events
 * captured before then are dropped.
 */
function startPostHog(): Promise<PostHog> {
  started ??= new Promise<void>((resolve) => {
    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => resolve(), { timeout: 3000 })
    } else {
      setTimeout(resolve, 1000)
    }
  })
    .then(() => import("posthog-js"))
    .then(({ default: posthog }) => {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
        api_host: "/ingest",
        ui_host: "https://us.posthog.com",
        defaults: "2026-01-30",
        capture_exceptions: true,
        // Students' marks and WAM render as text, so replays and
        // autocaptured clicks record no page text and no inputs.
        mask_all_text: true,
        session_recording: { maskAllInputs: true, maskTextSelector: "*" },
      })
      return posthog
    })
  return started
}

// Starts PostHog and bridges the MAC session (via useSession) to its
// identity. The id is the central macUserId, the same id server-side
// captures use, so a signed-in user's events merge into one profile.
// No email or name goes to PostHog. Mounted once in the root layout.
//
// Skipped in dev: keeps localhost out of prod analytics, and avoids the
// "could not load recorder" / "failed to fetch" noise when an ad
// blocker swallows the lazy-loaded recorder script.
export function PostHogIdentify() {
  const { data, isPending } = useSession()
  const lastIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (process.env.NODE_ENV === "production") void startPostHog()
  }, [])

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || isPending) return
    const nextId = data?.user?.id ?? null
    const lastId = lastIdRef.current
    if (nextId === lastId) return
    lastIdRef.current = nextId

    void startPostHog().then((posthog) => {
      if (nextId) posthog.identify(nextId)
      // Was signed in, now signed out — drop the alias.
      else if (lastId) posthog.reset()
    })
  }, [data, isPending])

  return null
}
