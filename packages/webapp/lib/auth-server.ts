import { cache } from "react"
import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { user } from "@monmap/db"

import { getDb } from "./db/client"
import {
  AUTH_URL,
  type MacClaims,
  sessionCookieHeader,
  verifyMacToken,
} from "./mac-auth"


/** After this long without an answer, the visitor counts as anonymous. */
const AUTH_TIMEOUT_MS = 3000

/**
 * Resolve the current user from the shared MAC session cookie.
 *
 * MonMap no longer mints its own sessions: it forwards the incoming
 * `.monashcoding.com` session cookie to the central service's
 * `/api/auth/token` endpoint, then verifies the returned EdDSA JWT
 * locally against the JWKS (no per-request network beyond the token
 * mint). The canonical identity is `claims.macUserId`, which — because
 * MonMap's 405 legacy accounts were migrated with their ids preserved —
 * equals the old Better Auth `user.id`. So every table keyed by
 * `user.id` (`user_plan`, `user_grade`, `review`) stays valid.
 *
 * Returns null when the visitor is anonymous (no session cookie,
 * expired session, token endpoint 401 or slow, etc.).
 *
 * The local `user` table is now just a mirror kept for FK integrity.
 * A known user costs one SELECT; a row is inserted only on first sight
 * (never clobbering the real name/image the migrated rows carry), and
 * its email is updated only when the central email changed. Brand-new
 * central users get a minimal row; the header shows their live Google
 * name/image via the client `useSession()`.
 *
 * Wrapped in `cache()`, so one render or one server action resolves it
 * once. Use this in server components and server actions when you need
 * the mirror row; `getClaims()` is enough when you only need the id or
 * email. For client components prefer `useSession()` from
 * `lib/auth-client`.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const claims = await getClaims()
  if (!claims) return null

  const db = getDb()
  const [row] = await db
    .select({ email: user.email, name: user.name, image: user.image })
    .from(user)
    .where(eq(user.id, claims.macUserId))
    .limit(1)

  let name = row?.name ?? claims.email
  let image = row?.image ?? null
  if (!row) {
    // First sight of this user: create the mirror row so FKs hold.
    // onConflictDoNothing covers two requests racing on the same id.
    const [created] = await db
      .insert(user)
      .values({
        id: claims.macUserId,
        email: claims.email,
        name: claims.email,
        emailVerified: true,
      })
      .onConflictDoNothing({ target: user.id })
      .returning({ name: user.name, image: user.image })
    if (created) {
      name = created.name
      image = created.image
    }
  } else if (row.email !== claims.email) {
    await db
      .update(user)
      .set({ email: claims.email })
      .where(eq(user.id, claims.macUserId))
  }

  return {
    id: claims.macUserId,
    email: claims.email,
    name,
    image,
    roles: claims.roles,
  }
})

/**
 * The verified MAC claims for this request, or null for anonymous
 * visitors. No database work, so actions that only need the user's id
 * or email can skip the mirror row.
 */
export const getClaims = cache(async (): Promise<MacClaims | null> => {
  const cookie = sessionCookieHeader((await headers()).get("cookie"))
  if (!cookie) return null

  let token: string | undefined
  try {
    const res = await fetch(`${AUTH_URL}/api/auth/token`, {
      headers: { cookie },
      // Central mints tokens per session; never cache across requests.
      cache: "no-store",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    })
    if (!res.ok) return null // 401 = not signed in
    token = (await res.json())?.token
  } catch {
    return null
  }
  if (typeof token !== "string" || !token) return null

  try {
    return await verifyMacToken(token)
  } catch {
    return null
  }
})

export interface CurrentUser {
  id: string
  email: string
  name: string
  image: string | null
  roles: string[]
}

/**
 * The signed-in user's display name from the central session, or null.
 * The local `user` mirror only holds the email for users who joined
 * after the move to central auth, so code that needs a real name (the
 * initials on a review) asks the central service.
 */
export async function fetchSessionName(): Promise<string | null> {
  const cookie = sessionCookieHeader((await headers()).get("cookie"))
  if (!cookie) return null
  try {
    const res = await fetch(`${AUTH_URL}/api/auth/get-session`, {
      headers: { cookie },
      cache: "no-store",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const name = (await res.json())?.user?.name
    return typeof name === "string" && name.trim() ? name.trim() : null
  } catch {
    return null
  }
}
