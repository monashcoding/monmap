// `better-auth/minimal` strips Kysely from the bundle (we use the
// Drizzle adapter directly). Importing the full `better-auth` entry
// also pulls a second drizzle-orm copy, which causes duplicate-type
// errors against our shared schema — see CLAUDE.md and the pnpm
// override on drizzle-orm in the root package.json.
import { betterAuth } from "better-auth/minimal"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { account, session, user, verification } from "@monmap/db/schema"
import { getDb } from "./db/client"

/**
 * Resolve the public origin Better Auth uses to mint OAuth callback URLs
 * and validate cookie domains. Resolution order:
 *
 *   1. BETTER_AUTH_URL — explicit override. Set this in prod for the
 *      custom domain (e.g. https://monmap.monashcoding.com), otherwise Vercel will
 *      hand back the per-deployment *.vercel.app hostname which Google's
 *      OAuth client doesn't have whitelisted.
 *   2. VERCEL_URL — Vercel injects this on every deployment (preview &
 *      production). It's a bare hostname, so we prepend https://.
 *   3. localhost:3000 — dev fallback.
 *
 * Anywhere we depend on this, the same value should be added to Google
 * Cloud Console as an authorized redirect URI: `${baseURL}/api/auth/callback/google`.
 */
const baseURL =
  process.env.BETTER_AUTH_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ??
  "http://localhost:3000"

export const auth = betterAuth({
  baseURL,
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  // nextCookies must be the last plugin — it wraps cookie writes so
  // server-action redirects carry the session cookie through.
  plugins: [nextCookies()],
})
