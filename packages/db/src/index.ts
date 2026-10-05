import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Options } from "postgres";
import * as schema from "./schema.ts";

export * from "./schema.ts";
export * from "./planner-state.ts";
export * from "./curriculum.ts";
export * from "./overrides.ts";

export type Database = ReturnType<typeof createDb>;

export interface CreateDbOptions {
  /** Override postgres-js pool options. */
  pool?: Options<Record<string, never>>;
}

/**
 * Build a Drizzle client bound to a Postgres connection string.
 *
 * We pass `casing: "snake_case"` to match drizzle.config.ts — schema
 * fields are camel-cased in TS, snake-cased in the DB.
 *
 * Pool defaults suit a long-lived process that talks to Postgres
 * directly (the self-hosted webapp and the ingest CLI): up to 10
 * connections, idle sockets kept for 5 minutes and each connection
 * replaced after an hour. Pass `{ pool }` to tune.
 *
 * Statements are not prepared. Drizzle runs every query through
 * postgres.js `unsafe()`, which never prepares whatever the pool says,
 * so `prepare: true` here would have no effect. Do not force it on:
 * the variable-length IN and VALUES lists would fill postgres.js's
 * per-connection statement cache, which it never evicts.
 */
export function createDb(
  url: string,
  options: CreateDbOptions = {},
): ReturnType<typeof drizzle<typeof schema>> {
  const sql = postgres(url, {
    max: 10,
    prepare: false,
    idle_timeout: 300,
    max_lifetime: 60 * 60,
    connect_timeout: 10,
    ...options.pool,
  });
  return drizzle(sql, { schema, casing: "snake_case" });
}
