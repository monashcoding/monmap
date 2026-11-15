/*
 * The NEXT_PUBLIC_* values, which the bundler inlines at build time.
 * Each must be written out as `process.env.NEXT_PUBLIC_X` for that to
 * happen, so this file cannot go through defineEnv's lookup by name.
 * Safe to import from client components.
 */

/** The central MAC auth origin the browser signs in against. */
export const PUBLIC_AUTH_URL =
  process.env.NEXT_PUBLIC_AUTH_URL || "https://auth.monashcoding.com"

/** The public origin of this site, or undefined in local dev. */
export const PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || undefined

/** The PostHog project token. Analytics stays off without it. */
export const PUBLIC_POSTHOG_TOKEN =
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || undefined
