import { PostHog } from "posthog-node"

/*
 * The server side of lib/analytics.ts, with the same rules: events
 * never carry an email, a name, a plan name or a grade, and nothing is
 * sent outside production, so localhost stays out of prod analytics.
 */

const ENABLED = process.env.NODE_ENV === "production"

let posthogClient: PostHog | null = null

/**
 * Send one event for the central macUserId and wait until it is sent.
 * A PostHog failure is dropped, so analytics never fails the action
 * that called it.
 */
export async function captureServer(
  userId: string,
  event: string,
  properties?: Record<string, string | number | boolean>
): Promise<void> {
  if (!ENABLED) return
  posthogClient ??= new PostHog(
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!,
    {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    }
  )
  posthogClient.capture({ distinctId: userId, event, properties })
  try {
    await posthogClient.flush()
  } catch {
    // The event is lost; the caller carries on.
  }
}
