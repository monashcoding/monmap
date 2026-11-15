/*
 * The server environment, read once (CONVENTIONS server.env). Values
 * come from the monorepo-root `.env`, which next.config.mjs loads
 * before the server boots. Browser code reads lib/env-public.ts.
 */
import { defineEnv, env as e } from "@monashcoding/server"
import { z } from "zod"

export const env = defineEnv({
  // Runtime only: `next build` imports the routes without a database.
  // lib/db/client.ts throws on first use when it is missing.
  DATABASE_URL: z.string().optional(),
  // The webapp's pool size. Keep it under Postgres max_connections.
  DB_POOL_MAX: e.integer(10),
  // TLS to Postgres. Unset: required for every host except localhost.
  // Set `disable` when the database is on a private Docker network.
  DATABASE_SSL: z.enum(["require", "verify-full", "disable"]).optional(),

  // Central MAC auth. @monashcoding/auth reads the same two variables.
  AUTH_URL: e.url().default("https://auth.monashcoding.com"),
  JWT_AUDIENCE: z.string().default("mac-suite"),

  // PostHog. The token is inlined into the client bundle at build time
  // and read again here by the server at runtime.
  NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),

  // Reviews. REVIEW_ADMIN_EMAILS and CLASSIFIER_* are read per call in
  // lib/reviews/admin.ts and lib/reviews/classifier.ts.
  REVIEW_TAG_SECRET: z.string().optional(),
  VIEW_KEY_SECRET: z.string().optional(),
})
