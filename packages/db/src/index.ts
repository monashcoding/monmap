import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Options } from "postgres";
import * as schema from "./schema.ts";

export * from "./schema.ts";
export * from "./planner-state.ts";
export * from "./curriculum.ts";

export type Database = ReturnType<typeof createDb>;

export interface CreateDbOptions {
  /** Override postgres-js pool options. Defaults target Vercel serverless. */
  pool?: Options<Record<string, never>>;
}

/**
 * Build a Drizzle client bound to a Postgres connection string.
 *
 * We pass `casing: "snake_case"` to match drizzle.config.ts — schema
 * fields are camel-cased in TS, snake-cased in the DB.
 *
 * Pool defaults target Vercel serverless: `max: 1` so a single function
 * instance never opens more than one connection (each instance is one
 * concurrent request), `idle_timeout` reaps the socket before the next
 * cold start, and `prepare: false` is required when going through a
 * transaction-mode pooler (PgBouncer / Neon / Supabase pgbouncer).
 * Long-running consumers (the ingest CLI) can pass `{ pool: { max, ... } }`.
 *
 * `connect_timeout` (seconds) is the important one for serverless: under
 * a crawl burst, many function instances open connections at once and
 * the pooler can hit its ceiling. Without a connect timeout a stalled
 * connect hangs until the function's execution timeout and surfaces to
 * the client (and Googlebot) as a 504. Capping it at 10s turns that into
 * a fast, catchable error the render can 500/notFound on instead of a
 * silent hang — well above the <100ms a healthy connect takes.
 */
export function createDb(
  url: string,
  options: CreateDbOptions = {},
): ReturnType<typeof drizzle<typeof schema>> {
  const sql = postgres(url, {
    max: 1,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
    prepare: false,
    ...options.pool,
  });
  return drizzle(sql, { schema, casing: "snake_case" });
}
