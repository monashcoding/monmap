import type { PostHog, Properties } from "posthog-js"

/*
 * The only module that imports posthog-js (eslint.config.mjs enforces
 * it). The library loads on demand, so it stays off the first-load
 * bundle of every route.
 *
 * Events must never carry an email, a name, a plan name or a grade.
 *
 * Everything here does nothing outside production: that keeps
 * localhost out of prod analytics, and avoids the "could not load
 * recorder" noise when an ad blocker swallows the recorder script.
 */

const ENABLED = process.env.NODE_ENV === "production"

// Attributes that carry readable text. The UI puts names, plan names
// and unit codes in some of them (an aria-label, a rename title), so
// replays mask them. Layout attributes such as class and style stay,
// or the replay loses its styling.
const TEXT_ATTRIBUTES = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "content",
  "label",
  "placeholder",
  "title",
  "value",
])

function maskReplayAttribute(name: string, value: string): string {
  return TEXT_ATTRIBUTES.has(name) ? "*" : value
}

let started: Promise<PostHog | null> | null = null

/**
 * Load and start posthog-js once, when the browser is idle after
 * hydration, so analytics never delays the first interaction. Calls
 * made before then wait for it.
 */
function startPostHog(): Promise<PostHog | null> {
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
        // autocaptured clicks record no page text, no inputs and no
        // text-bearing attributes. Autocapture drops every attribute.
        mask_all_text: true,
        mask_all_element_attributes: true,
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: "*",
          maskAttributeFn: maskReplayAttribute,
          // Server action bodies hold grades, plan names and review
          // text. A local false wins over the project setting, so a
          // dashboard toggle cannot turn payload capture on.
          recordBody: false,
          recordHeaders: false,
        },
      })
      return posthog
    })
    .catch(() => {
      // A failed chunk load (a redeploy, a flaky network) must not
      // stick, or every later call rejects. The next call retries.
      started = null
      return null
    })
  return started
}

/** Start PostHog without sending anything (the root layout does this). */
export function startAnalytics(): void {
  if (ENABLED) void startPostHog()
}

export function capture(event: string, props?: Properties): void {
  if (ENABLED) void startPostHog().then((p) => p?.capture(event, props))
}

/** Tie later events to the central macUserId. Never pass an email. */
export function identify(userId: string): void {
  if (ENABLED) void startPostHog().then((p) => p?.identify(userId))
}

export function resetIdentity(): void {
  if (ENABLED) void startPostHog().then((p) => p?.reset())
}
