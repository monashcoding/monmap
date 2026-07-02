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

const AUTH_URL = process.env.AUTH_URL ?? "https://auth.monashcoding.com"
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
 * Verify a MAC-issued JWT. Throws if the signature, issuer, audience, or
 * expiry (`exp`) is invalid. Returns the typed MAC claims on success.
 */
export async function verifyMacToken(token: string): Promise<MacClaims> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: ISSUER, // checks `iss`
    audience: AUDIENCE, // checks `aud`
    // `exp` is enforced by jwtVerify automatically.
  })

  return {
    macUserId: payload.macUserId as string,
    email: payload.email as string,
    roles: (payload.roles as string[]) ?? [],
    ver: (payload.ver as number) ?? 1,
  }
}
