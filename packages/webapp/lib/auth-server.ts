import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { user } from "@monmap/db"

import { getDb } from "./db/client"
import { type MacClaims, verifyMacToken } from "./mac-auth"

const AUTH_URL = process.env.AUTH_URL ?? "https://auth.monashcoding.com"

/**
 * Resolve the current user from the shared MAC session cookie.
 *
 * MonMap no longer mints its own sessions: it forwards the incoming
 * `.monashcoding.com` cookie to the central service's `/api/auth/token`
 * endpoint, then verifies the returned EdDSA JWT locally against the
 * JWKS (no per-request network beyond the token mint). The canonical
 * identity is `claims.macUserId`, which — because MonMap's 405 legacy
 * accounts were migrated with their ids preserved — equals the old
 * Better Auth `user.id`. So every table keyed by `user.id`
 * (`user_plan`, `user_grade`) stays valid.
 *
 * Returns null when the visitor is anonymous (no cookie, expired
 * session, token endpoint 401, etc.).
 *
 * The local `user` table is now just a mirror kept for FK integrity: we
 * ensure a row exists (`onConflictDoNothing`, so we never clobber the
 * real name/image the migrated rows already carry) and read back its
 * display fields. Brand-new central users get a minimal row; the header
 * shows their live Google name/image via the client `useSession()`.
 *
 * Use this in server components and server actions; for client
 * components prefer `useSession()` from `lib/auth-client`.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const claims = await resolveClaims()
  if (!claims) return null

  const db = getDb()

  // Ensure the mirror row exists so FKs from user_plan/user_grade hold.
  // onConflictDoNothing: existing (migrated) rows keep their real
  // name/image; only genuinely-new users get this placeholder name.
  await db
    .insert(user)
    .values({
      id: claims.macUserId,
      email: claims.email,
      name: claims.email,
      emailVerified: true,
    })
    .onConflictDoNothing({ target: user.id })

  const [row] = await db
    .select({ name: user.name, image: user.image })
    .from(user)
    .where(eq(user.id, claims.macUserId))
    .limit(1)

  return {
    id: claims.macUserId,
    email: claims.email,
    name: row?.name ?? claims.email,
    image: row?.image ?? null,
    roles: claims.roles,
  }
}

/**
 * Fetch a fresh JWT for the current session from the central service
 * (forwarding the browser's shared cookie) and verify it locally.
 * Returns null for anonymous visitors.
 */
async function resolveClaims(): Promise<MacClaims | null> {
  const cookie = (await headers()).get("cookie")
  if (!cookie) return null

  let token: string | undefined
  try {
    const res = await fetch(`${AUTH_URL}/api/auth/token`, {
      headers: { cookie },
      // Central mints tokens per session; never cache across requests.
      cache: "no-store",
    })
    if (!res.ok) return null // 401 = not signed in
    token = (await res.json())?.token
  } catch {
    return null
  }
  if (!token) return null

  try {
    return await verifyMacToken(token)
  } catch {
    return null
  }
}

export interface CurrentUser {
  id: string
  email: string
  name: string
  image: string | null
  roles: string[]
}
