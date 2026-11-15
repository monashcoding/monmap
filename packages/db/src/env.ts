import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load the root `.env` no matter which package we're running from.
 * See CLAUDE.md §1: all env vars live at the repo root.
 */
const here = fileURLToPath(import.meta.url);
config({ path: resolve(here, "../../../../.env"), quiet: true });

export const DATABASE_URL = (() => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set in root .env");
  return url;
})();

/**
 * TLS to Postgres: `require`, `verify-full` or `disable`. Unset,
 * `@monashcoding/db` requires TLS for every host except localhost.
 */
export const DATABASE_SSL = (() => {
  const mode = process.env.DATABASE_SSL;
  if (!mode) return undefined;
  if (mode === "require" || mode === "verify-full" || mode === "disable") {
    return mode;
  }
  throw new Error("DATABASE_SSL must be require, verify-full or disable");
})();
