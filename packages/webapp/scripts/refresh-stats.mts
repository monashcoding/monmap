/**
 * Rebuild the /search popularity snapshot now, instead of waiting for
 * a server to find it a day old (lib/db/entity-stats.ts).
 *
 *   pnpm --filter webapp refresh:stats
 *
 * Requires DATABASE_URL from the repo-root .env.
 */
import { DATABASE_URL } from "@monmap/db/env"

process.env.DATABASE_URL ??= DATABASE_URL
const { refreshEntityStats } = await import("../lib/db/entity-stats.ts")

const started = Date.now()
const ran = await refreshEntityStats(true)
console.log(
  ran
    ? `Rebuilt in ${Date.now() - started} ms.`
    : "Another server is rebuilding it now."
)
process.exit(0)
