import { createServerAnalytics } from "@monashcoding/analytics/server"

import { env } from "@/lib/env"

/*
 * The server side of lib/analytics.ts, with the same rules: events
 * never carry an email, a name, a plan name or a grade, and nothing is
 * sent outside production, so localhost stays out of prod analytics.
 * `capture(macUserId, event, properties)` waits until the event is
 * sent and drops a PostHog failure.
 */
export const serverAnalytics = createServerAnalytics({
  app: "monmap",
  posthogToken: env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
  host: env.NEXT_PUBLIC_POSTHOG_HOST,
})
