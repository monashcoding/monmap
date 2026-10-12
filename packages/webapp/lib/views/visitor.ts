/**
 * Who a page view belongs to, without keeping who the visitor is.
 *
 * A view is keyed by an HMAC of the day, the IP address and the user
 * agent. The key has no IP address in it and changes every day, so the
 * same visitor cannot be linked across days. Within one day, repeat
 * views of a page count once.
 */
import { createHmac, randomBytes } from "node:crypto"

// Without VIEW_KEY_SECRET each server process picks a random key, so a
// restart counts a returning visitor again on that day.
const SECRET = process.env.VIEW_KEY_SECRET || randomBytes(32).toString("hex")

/** Today in Melbourne as YYYY-MM-DD: a view day follows Monash's day. */
export function viewDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
  }).format(now)
}

export function visitorKey(
  day: string,
  ip: string,
  userAgent: string,
  secret: string = SECRET
): string {
  return createHmac("sha256", secret)
    .update(`${day}\n${ip}\n${userAgent}`)
    .digest("hex")
    .slice(0, 32)
}

/**
 * The client's IP address. Cloudflare sets cf-connecting-ip and
 * overwrites any value the client sent. Without it, the last
 * x-forwarded-for entry is the one our own proxy added.
 */
export function clientIp(headers: Headers): string | null {
  const cf = headers.get("cf-connecting-ip")?.trim()
  if (cf) return cf
  const forwarded = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return forwarded?.at(-1) ?? null
}

const BOT =
  /bot|crawl|spider|slurp|preview|fetch|monitor|headless|lighthouse|python|curl|wget|axios|node-fetch|go-http|java\//i

/** Crawlers and scripts, which must not count as views. */
export function isBot(userAgent: string): boolean {
  return !userAgent || BOT.test(userAgent)
}
