import { createDb, type Database } from "@monmap/db"

import { env } from "../env.ts"

// DATABASE_URL is loaded from the monorepo-root `.env` by
// `next.config.mjs` before the Node process boots. See CLAUDE.md §1.

let cached: Database | null = null

/**
 * One Drizzle client per Node process. Next.js can hot-reload server
 * modules in dev; caching on the global avoids proliferating pg pools.
 *
 * The connection comes from `@monashcoding/db` through `createDb` in
 * `@monmap/db`. The pool size comes from `DB_POOL_MAX` (default 10),
 * so it can follow Postgres `max_connections`, and the TLS mode from
 * `DATABASE_SSL`.
 */
export function getDb(): Database {
  if (cached) return cached
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set in root .env")
  cached = createDb(env.DATABASE_URL, {
    max: env.DB_POOL_MAX,
    ssl: env.DATABASE_SSL,
  })
  return cached
}
