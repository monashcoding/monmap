import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "@monashcoding/db";
import { DATABASE_SSL, DATABASE_URL } from "./env.ts";

// Apply the pending migrations in ../drizzle to DATABASE_URL, on one
// connection. Same ledger (drizzle.__drizzle_migrations) as
// `drizzle-kit migrate`, which this replaces.
await runMigrations({
  app: "monmap",
  migrationsFolder: resolve(fileURLToPath(import.meta.url), "../../drizzle"),
  url: DATABASE_URL,
  ...(DATABASE_SSL === undefined ? {} : { ssl: DATABASE_SSL }),
});
console.log("Migrations applied.");
