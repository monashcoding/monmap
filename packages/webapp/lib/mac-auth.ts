/**
 * MAC token verifier — verifies a Better Auth JWT issued by the central
 * MAC identity service (auth.monashcoding.com) locally against its JWKS.
 *
 * Copied from the mac-auth repo (`examples/verify.ts`). The JWKS is
 * fetched once and cached by `createRemoteJWKSet` (with its own
 * background refresh), so verifying a token does NOT call the auth
 * service per request.
 *
 * Only dependency: `jose`.
 */
import { createRemoteJWKSet, jwtVerify } from "jose"

export const AUTH_URL = process.env.AUTH_URL ?? "https://auth.monashcoding.com"
const ISSUER = AUTH_URL
const AUDIENCE = process.env.JWT_AUDIENCE ?? "mac-suite"

// Cached remote JWKS (Ed25519 public keys). Reused across calls — do NOT
// recreate per request.
const JWKS = createRemoteJWKSet(new URL(`${AUTH_URL}/api/auth/jwks`))

/** The claims a verified MAC token is guaranteed to carry. */
export interface MacClaims {
  macUserId: string
  email: string
  roles: string[]
  ver: number
}

/**
 * Verify a MAC-issued JWT. Throws if the signature, algorithm, issuer,
 * audience or expiry (`exp`) is invalid, or if a claim has the wrong
 * type. Returns the typed MAC claims on success.
 */
export async function verifyMacToken(token: string): Promise<MacClaims> {
  const { payload } = await jwtVerify(token, JWKS, {
    // The central service signs with Ed25519 only.
    algorithms: ["EdDSA"],
    issuer: ISSUER, // checks `iss`
    audience: AUDIENCE, // checks `aud`
    // `exp` is enforced by jwtVerify automatically.
  })

  const { macUserId, email, roles, ver } = payload
  if (typeof macUserId !== "string" || !macUserId) {
    throw new Error("MAC token has no macUserId")
  }
  if (typeof email !== "string" || !email) {
    throw new Error("MAC token has no email")
  }
  if (
    roles !== undefined &&
    !(Array.isArray(roles) && roles.every((r) => typeof r === "string"))
  ) {
    throw new Error("MAC token roles are not a list of strings")
  }
  if (ver !== undefined && typeof ver !== "number") {
    throw new Error("MAC token ver is not a number")
  }
  return { macUserId, email, roles: roles ?? [], ver: ver ?? 1 }
}

/**
 * Better Auth's session cookies: `<prefix>.session_token`, plus the
 * optional `<prefix>.session_data` cache (chunked as `.0`, `.1` when
 * large), with or without the `__Secure-` prefix. The prefix is the
 * central service's choice, so only the suffix is matched.
 */
const SESSION_COOKIE = /(?:^|[._-])session_(?:token|data)(?:\.\d+)?$/
const SESSION_TOKEN = /(?:^|[._-])session_token$/

/**
 * The part of a Cookie header the central auth service needs, or null
 * when it holds no session token. Anonymous visitors still carry
 * analytics cookies, so this decides whether to call the service at
 * all, and it keeps those other cookies on this host.
 */
export function sessionCookieHeader(cookie: string | null): string | null {
  if (!cookie) return null
  const kept: string[] = []
  let hasToken = false
  for (const part of cookie.split(";")) {
    const pair = part.trim()
    const eq = pair.indexOf("=")
    const name = eq > 0 ? pair.slice(0, eq) : ""
    if (!SESSION_COOKIE.test(name)) continue
    kept.push(pair)
    if (SESSION_TOKEN.test(name)) hasToken = true
  }
  return hasToken ? kept.join("; ") : null
}
