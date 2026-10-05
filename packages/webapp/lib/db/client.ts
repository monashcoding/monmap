import { createDb, type Database } from "@monmap/db"

// DATABASE_URL is loaded from the monorepo-root `.env` by
// `next.config.mjs` before the Node process boots. See CLAUDE.md §1.

let cached: Database | null = null

/**
 * One Drizzle client per Node process. Next.js can hot-reload server
 * modules in dev; caching on the global avoids proliferating pg pools.
 *
 * The webapp is a long-lived Node server that talks to Postgres
 * directly, which is what `createDb`'s pool defaults are for. The pool
 * size comes from `DB_POOL_MAX` (default 10), so it can follow Postgres
 * `max_connections`. Prepared statements stay on: there is no
 * transaction-mode pooler in front.
 */
export function getDb(): Database {
  if (cached) return cached
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set in root .env")
  const max = Number(process.env.DB_POOL_MAX) || 10
  cached = createDb(url, { pool: { max, prepare: true } })
  return cached
}
