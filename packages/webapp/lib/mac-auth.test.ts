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
  ;({ verifyMacToken } = await import("./mac-auth.ts"))
})()

function sign(
  claims: Record<string, unknown>,
  opts: { iss?: string; aud?: string; expiresIn?: string } = {}
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "EdDSA", kid: "test-key" })
    .setIssuedAt()
    .setIssuer(opts.iss ?? authUrl)
    .setAudience(opts.aud ?? AUDIENCE)
    .setExpirationTime(opts.expiresIn ?? "15m")
    .sign(privateKey)
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
