import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export * from "./schema.ts";

export type Database = ReturnType<typeof createDb>;

/**
 * Build a Drizzle client bound to a Postgres connection string.
 *
 * We pass `casing: "snake_case"` to match drizzle.config.ts — schema
 * fields are camel-cased in TS, snake-cased in the DB.
 */
export function createDb(url: string): ReturnType<typeof drizzle<typeof schema>> {
  const sql = postgres(url, { prepare: false });
  return drizzle(sql, { schema, casing: "snake_case" });
}
