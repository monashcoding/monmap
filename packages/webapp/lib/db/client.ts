import { createDb, type Database } from "@monmap/db";

// DATABASE_URL is loaded from the monorepo-root `.env` by
// `next.config.mjs` before the Node process boots. See CLAUDE.md §1.

let cached: Database | null = null;

/**
 * One Drizzle client per Node process. Next.js can hot-reload server
 * modules in dev; caching on the global avoids proliferating pg pools.
 */
export function getDb(): Database {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set in root .env");
  cached = createDb(url);
  return cached;
}

/** The handbook year the app renders. 2026 is the only populated year. */
export const HANDBOOK_YEAR = "2026";
