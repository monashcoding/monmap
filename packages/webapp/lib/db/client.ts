import { createDb, type Database } from "@monmap/db"

// DATABASE_URL is loaded from the monorepo-root `.env` by
// `next.config.mjs` before the Node process boots. See CLAUDE.md §1.

let cached: Database | null = null

/**
 * One Drizzle client per Node process. Next.js can hot-reload server
 * modules in dev; caching on the global avoids proliferating pg pools.
 *
 * The webapp now runs as a long-lived Node server (self-hosted on Oracle
 * via Docker) rather than per-request serverless functions, so it wants a
 * real connection pool instead of `createDb`'s `max: 1` serverless
 * default: one process fields many concurrent requests. It also talks
 * directly to Postgres (no transaction-mode pooler in front), so prepared
 * statements are safe again — `createDb` disables them only for PgBouncer.
 * Override `DB_POOL_MAX` if you tune Postgres `max_connections`.
 *
 * `createDb`'s 20 s idle timeout is a serverless default: here it would
 * drop warm connections, and their prepared statements, after every
 * quiet spell. Five minutes keeps them across bursts and still retires
 * sockets a NAT or firewall might silently drop. Each connection is
 * replaced after an hour rather than 30 minutes.
 */
export function getDb(): Database {
  if (cached) return cached
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set in root .env")
  const max = Number(process.env.DB_POOL_MAX) || 10
  cached = createDb(url, {
    pool: {
      max,
      prepare: true,
      idle_timeout: 300,
      max_lifetime: 60 * 60,
      connect_timeout: 10,
    },
  })
  return cached
}
