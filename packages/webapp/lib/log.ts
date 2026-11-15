import { createLogger } from "@monashcoding/server"

/** One JSON line per event on stdout (CONVENTIONS server.log). */
export const logger = createLogger("monmap")
