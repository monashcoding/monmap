import { type Analytics, createAnalytics } from "@monashcoding/analytics/client"

import { PUBLIC_POSTHOG_TOKEN } from "@/lib/env-public"

/*
 * The app's one analytics object, from `@monashcoding/analytics`. The
 * package is the only importer of posthog-js (the lint config enforces
 * it) and loads it on demand, so it stays off the first-load bundle of
 * every route. It also carries the replay masking: no page text, no
 * inputs, no text-bearing attributes, no request bodies.
 *
 * Events must never carry an email, a name, a plan name or a grade.
 *
 * Nothing is sent outside production: that keeps localhost out of prod
 * analytics, and avoids the "could not load recorder" noise when an ad
 * blocker swallows the recorder script.
 */

// Public by design (it ships in every page), so it lives in code, not .env.
const GA_MEASUREMENT_ID = "G-6QWVWW0NLG"

const mac = createAnalytics({
  // Sent as the `app` property of every event.
  app: "monmap",
  posthogToken: PUBLIC_POSTHOG_TOKEN,
  // Page views only.
  gaId: GA_MEASUREMENT_ID,
})

/**
 * What a MonMap event property can be. The package's EventProperties
 * has no `undefined` (an optional property that is left off) and no
 * string list (`rank_top_features` on `unit_added`), and both are in
 * events PostHog already holds.
 */
type EventValue = string | number | boolean | null | undefined | readonly string[]
type Sendable = string | number | boolean | null

export const analytics: Analytics & {
  capture(event: string, properties?: Readonly<Record<string, EventValue>>): void
} = {
  ...mac,
  capture(event, properties) {
    const sent: Record<string, Sendable> = {}
    for (const [key, value] of Object.entries(properties ?? {})) {
      if (value === undefined) continue
      // SAFETY: posthog-js sends a string list as a JSON array, as it
      // did before; only the package's property type leaves lists out.
      sent[key] = value as Sendable
    }
    mac.capture(event, sent)
  },
}
