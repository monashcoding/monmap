import { headers } from "next/headers"
import { auth } from "./auth"

/**
 * Resolve the current user from the request cookies. Returns null when
 * the visitor is anonymous (no session, expired cookie, etc.).
 *
 * Use this in server components and server actions; for client
 * components prefer `useSession()` from `lib/auth-client`.
 */
export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user ?? null
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
