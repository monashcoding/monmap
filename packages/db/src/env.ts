import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load the root `.env` no matter which package we're running from.
 * See CLAUDE.md §1: all env vars live at the repo root.
 */
const here = fileURLToPath(import.meta.url);
config({ path: resolve(here, "../../../../.env") });

export const DATABASE_URL = (() => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set in root .env");
  return url;
})();
