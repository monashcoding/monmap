import { drizzle } from "drizzle-orm/postgres-js";
import { createDb as createMacDb, type SslMode } from "@monashcoding/db";
import * as schema from "./schema.ts";

export * from "./schema.ts";
export * from "./planner-state.ts";
export * from "./curriculum.ts";
export * from "./overrides.ts";

export type Database = ReturnType<typeof createDb>;

export interface CreateDbOptions {
  /** Pool size. Defaults to `DB_POOL_MAX`, then 10. */
  max?: number;
  /**
   * TLS to Postgres. Unset, `@monashcoding/db` requires TLS for every
   * host except localhost; pass `disable` for a database on a private
   * network that does not serve TLS.
   */
  ssl?: SslMode;
}

/**
 * Build a Drizzle client bound to a Postgres connection string.
 *
 * The connection comes from `@monashcoding/db`: it names itself
 * `monmap` on the server, picks the TLS mode and recycles idle
 * sockets. Statements are not prepared: Drizzle runs every query
 * through postgres.js `unsafe()`, which never prepares.
 *
 * The Drizzle client is built here, not taken from the package,
 * because the schema needs `casing: "snake_case"` (fields are
 * camel-cased in TS, snake-cased in the DB, matching
 * drizzle.config.ts) and the package's client has no casing option.
 */
export function createDb(
  url: string,
  options: CreateDbOptions = {},
): ReturnType<typeof drizzle<typeof schema>> {
  const { sql } = createMacDb({
    app: "monmap",
    schema,
    url,
    ...(options.max === undefined ? {} : { max: options.max }),
    ...(options.ssl === undefined ? {} : { ssl: options.ssl }),
  });
  return drizzle(sql, { schema, casing: "snake_case" });
}
