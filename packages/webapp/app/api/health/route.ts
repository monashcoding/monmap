import { createHealthHandler } from "@monashcoding/server"
import { sql } from "drizzle-orm"

import { getDb } from "@/lib/db/client"

/**
 * 200 when the database answers, 503 when it does not, for Dokploy and
 * uptime monitors.
 *
 * GET /api/health
 */
export const dynamic = "force-dynamic"

export const GET = createHealthHandler({
  service: "monmap",
  checks: {
    db: async () => {
      await getDb().execute(sql`select 1`)
    },
  },
})
