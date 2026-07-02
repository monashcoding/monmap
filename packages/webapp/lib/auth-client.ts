import { createAuthClient } from "better-auth/react"

// MonMap consumes the central MAC identity service rather than running
// its own auth server. Point the Better Auth react client at the central
// origin and send the shared `.monashcoding.com` cookie on every call so
// `useSession()`, `signIn.social(...)`, and `signOut()` all talk to the
// central service. `credentials: "include"` is required because this is
// now cross-origin (monmap.monashcoding.com → auth.monashcoding.com).
//
// SSO relies on the shared cookie, which is only set for *.monashcoding.com
// hosts — so silent cross-app sign-in works in prod but not on localhost.
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.monashcoding.com",
  fetchOptions: { credentials: "include" },
})

export const { signIn, signOut, useSession } = authClient
