import { createMacAuthClient } from "@monashcoding/auth/client"
import { useMacSession } from "@monashcoding/auth/react"

import { PUBLIC_AUTH_URL } from "@/lib/env-public"

// MonMap consumes the central MAC identity service rather than running
// its own auth server. This is the browser client from
// `@monashcoding/auth`, pointed at the central origin: it sends the
// shared `.monashcoding.com` cookie on every call (cross-origin, so
// with credentials), reads the signed-in user from the MAC token and
// starts and ends the shared session.
//
// One client per page, built here and not with `getMacAuthClient()`,
// because NEXT_PUBLIC_AUTH_URL can point it at another auth origin.
//
// SSO relies on the shared cookie, which is only set for *.monashcoding.com
// hosts — so silent cross-app sign-in works in prod but not on localhost.
export const authClient = createMacAuthClient({ authUrl: PUBLIC_AUTH_URL })

/**
 * The MAC session in a client component: `loading` until the token
 * request settles, then `signed-in` (with `user`, the token's claims)
 * or `signed-out`.
 */
export function useSession() {
  return useMacSession(authClient)
}
