import assert from "node:assert/strict"
import { createServer, type Server } from "node:http"
import { after, test } from "node:test"

import { exportJWK, generateKeyPair, SignJWT } from "jose"

// Exercises the MAC token verifier against a throwaway local JWKS server,
// so it proves the wiring (JWKS URL, issuer/audience/expiry enforcement)
// with no network dependency on the real auth service.
//
// mac-auth.ts binds AUTH_URL/JWT_AUDIENCE and the remote JWKS once at
// import time, so we stand up a single server, point the env at it, and
// import the module once — all tests share that instance and only vary
// how the token is signed.

const AUDIENCE = "mac-suite"

let privateKey: CryptoKey
let authUrl: string
let server: Server
let verifyMacToken: (token: string) => Promise<unknown>
let sessionCookieHeader: (cookie: string | null) => string | null

const ready = (async () => {
  const pair = await generateKeyPair("EdDSA", { crv: "Ed25519" })
  privateKey = pair.privateKey
  const jwk = await exportJWK(pair.publicKey)
  jwk.kid = "test-key"
  jwk.alg = "EdDSA"

  server = createServer((req, res) => {
    if (req.url === "/api/auth/jwks") {
      res.setHeader("content-type", "application/json")
      res.end(JSON.stringify({ keys: [jwk] }))
      return
    }
    res.statusCode = 404
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as { port: number }
  authUrl = `http://127.0.0.1:${port}`

  process.env.AUTH_URL = authUrl
  process.env.JWT_AUDIENCE = AUDIENCE
  ;({ verifyMacToken, sessionCookieHeader } = await import("./mac-auth.ts"))
})()

function sign(
  claims: Record<string, unknown>,
  opts: {
    iss?: string
    aud?: string
    expiresIn?: string
    alg?: string
    key?: CryptoKey | Uint8Array
  } = {}
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: opts.alg ?? "EdDSA", kid: "test-key" })
    .setIssuedAt()
    .setIssuer(opts.iss ?? authUrl)
    .setAudience(opts.aud ?? AUDIENCE)
    .setExpirationTime(opts.expiresIn ?? "15m")
    .sign(opts.key ?? privateKey)
}

function base64url(v: unknown) {
  return Buffer.from(JSON.stringify(v)).toString("base64url")
}

after(() => {
  server.close()
})

test("verifyMacToken returns typed claims for a valid MAC token", async () => {
  await ready
  const token = await sign({
    macUserId: "abc123",
    email: "student@monash.edu",
    roles: ["member", "admin"],
    ver: 1,
  })
  const claims = await verifyMacToken(token)
  assert.deepEqual(claims, {
    macUserId: "abc123",
    email: "student@monash.edu",
    roles: ["member", "admin"],
    ver: 1,
  })
})

test("verifyMacToken defaults roles to [] and ver to 1 when absent", async () => {
  await ready
  const token = await sign({ macUserId: "u2", email: "x@monash.edu" })
  const claims = (await verifyMacToken(token)) as {
    roles: string[]
    ver: number
  }
  assert.deepEqual(claims.roles, [])
  assert.equal(claims.ver, 1)
})

test("verifyMacToken rejects a wrong audience", async () => {
  await ready
  const token = await sign(
    { macUserId: "u", email: "e@monash.edu" },
    { aud: "some-other-app" }
  )
  await assert.rejects(() => verifyMacToken(token))
})

test("verifyMacToken rejects a wrong issuer", async () => {
  await ready
  const token = await sign(
    { macUserId: "u", email: "e@monash.edu" },
    { iss: "https://evil.example.com" }
  )
  await assert.rejects(() => verifyMacToken(token))
})

test("verifyMacToken rejects an expired token", async () => {
  await ready
  const token = await sign(
    { macUserId: "u", email: "e@monash.edu" },
    { expiresIn: "-1m" }
  )
  await assert.rejects(() => verifyMacToken(token))
})

test("verifyMacToken rejects a token signed by another key with the same kid", async () => {
  await ready
  const other = await generateKeyPair("EdDSA", { crv: "Ed25519" })
  const token = await sign(
    { macUserId: "u", email: "e@monash.edu" },
    { key: other.privateKey }
  )
  await assert.rejects(() => verifyMacToken(token))
})

test("verifyMacToken rejects an HS256 token", async () => {
  await ready
  const token = await sign(
    { macUserId: "u", email: "e@monash.edu" },
    { alg: "HS256", key: new Uint8Array(32).fill(7) }
  )
  await assert.rejects(() => verifyMacToken(token))
})

test("verifyMacToken rejects an unsigned alg none token", async () => {
  await ready
  const now = Math.floor(Date.now() / 1000)
  const token = `${base64url({ alg: "none", kid: "test-key" })}.${base64url({
    macUserId: "u",
    email: "e@monash.edu",
    iss: authUrl,
    aud: AUDIENCE,
    iat: now,
    exp: now + 900,
  })}.`
  await assert.rejects(() => verifyMacToken(token))
})

test("verifyMacToken rejects claims with the wrong type", async () => {
  await ready
  for (const claims of [
    { email: "e@monash.edu" },
    { macUserId: "", email: "e@monash.edu" },
    { macUserId: 42, email: "e@monash.edu" },
    { macUserId: "u" },
    { macUserId: "u", email: ["e@monash.edu"] },
    { macUserId: "u", email: "e@monash.edu", roles: "admin" },
    { macUserId: "u", email: "e@monash.edu", roles: ["member", 1] },
    { macUserId: "u", email: "e@monash.edu", ver: "1" },
  ]) {
    const token = await sign(claims)
    await assert.rejects(() => verifyMacToken(token), JSON.stringify(claims))
  }
})

test("sessionCookieHeader keeps only Better Auth session cookies", async () => {
  await ready
  assert.equal(sessionCookieHeader(null), null)
  assert.equal(sessionCookieHeader(""), null)
  // Analytics cookies alone do not reach the auth service.
  assert.equal(sessionCookieHeader("ph_abc_posthog=%7B%7D; theme=dark"), null)
  assert.equal(
    sessionCookieHeader(
      "ph_abc_posthog=%7B%7D; better-auth.session_token=t.sig; theme=dark"
    ),
    "better-auth.session_token=t.sig"
  )
  assert.equal(
    sessionCookieHeader(
      "__Secure-mac.session_token=t; __Secure-mac.session_data.0=d0; __Secure-mac.session_data.1=d1"
    ),
    "__Secure-mac.session_token=t; __Secure-mac.session_data.0=d0; __Secure-mac.session_data.1=d1"
  )
  // A cache cookie without its token is not a session.
  assert.equal(sessionCookieHeader("better-auth.session_data=d"), null)
  assert.equal(sessionCookieHeader("my_session_token_x=1; session_token"), null)
})
