"use client"

import { MacAnalytics } from "@monashcoding/analytics/react"

import { analytics } from "@/lib/analytics"
import { useSession } from "@/lib/auth-client"

// Starts PostHog and Google Analytics, and bridges the MAC session to
// PostHog's identity. The id is the central macUserId, the same id
// server-side captures use, so a signed-in user's events merge into
// one profile. No email or name goes to PostHog. Mounted once in the
// root layout. lib/analytics.ts skips all of this outside production.
export function Analytics() {
  const session = useSession()

  // undefined while the session loads, null when signed out
  const userId =
    session.status === "loading" ? undefined : (session.user?.macUserId ?? null)

  return <MacAnalytics analytics={analytics} userId={userId} />
}
