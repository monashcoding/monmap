import { config } from "dotenv"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import withBundleAnalyzer from "@next/bundle-analyzer"

// Load the monorepo-root .env *before* Next.js boots, so server
// components can see DATABASE_URL. Next's built-in dotenv only looks
// inside the package, but CLAUDE.md §1 says one .env, at the repo
// root — see that file for rationale.
const here = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(here, "../../.env"), quiet: true })

const isProd = process.env.NODE_ENV === "production"
const authOrigin = new URL(
  process.env.NEXT_PUBLIC_AUTH_URL ?? "https://auth.monashcoding.com"
).origin

// Security headers on every response. They change nothing on screen.
const securityHeaders = [
  // No other site may frame MonMap (clickjacking on plan deletes and the
  // admin buttons). X-Frame-Options covers browsers without CSP 3.
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  // Production only: `next dev` needs eval for React Refresh, and HSTS
  // from local.monashcoding.com (`pnpm dev:sso`) would outlive the dev
  // session in the browser.
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
        // Report-only: browsers log violations to the console but block
        // nothing. Next's inline scripts and the ISR pages (which can't
        // carry a nonce) need 'unsafe-inline'. PostHog loads through
        // /ingest and runs its recorder in blob workers; sign-in and
        // useSession() call the central auth origin.
        {
          key: "Content-Security-Policy-Report-Only",
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data:",
            `connect-src 'self' ${authOrigin}`,
            "worker-src 'self' blob:",
            `form-action 'self' ${authOrigin}`,
          ].join("; "),
        },
      ]
    : []),
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-hosted deploy (Oracle Cloud + Dokploy, in a Docker container)
  // instead of Vercel. `standalone` emits a minimal server bundle at
  // `.next/standalone` with its own `server.js`, so the runtime image
  // doesn't need the full node_modules or pnpm — see the repo-root
  // Dockerfile. `outputFileTracingRoot` points at the monorepo root so
  // the trace picks up the workspace packages (`@monmap/db`, which is
  // raw TS and compiled in via `transpilePackages` below).
  output: "standalone",
  outputFileTracingRoot: resolve(here, "../.."),

  // `@monmap/db` / `@monmap/scraper` ship raw `.ts` via their `exports`
  // maps (packages/*/src/*.ts). Next must compile them like app code
  // rather than treat them as prebuilt deps.
  transpilePackages: ["@monmap/db", "@monmap/scraper"],

  // /search was called /tree until 2026-10. Old /tree?unit= and
  // ?course= links reach /search, which redirects them to the
  // /units/[code] and /courses/[code] pages.
  async redirects() {
    return [
      {
        source: "/tree",
        destination: "/search",
        permanent: true,
      },
    ]
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
  // Don't announce the framework in an X-Powered-By header.
  poweredByHeader: false,
  // PostHog calls /ingest/e/ and friends with a trailing slash; the
  // proxy in app/ingest/[...path]/route.ts must get them unredirected.
  skipTrailingSlashRedirect: true,
}

// Enable with `ANALYZE=true pnpm build` — writes HTML reports under
// .next/analyze/{client,nodejs,edge}.html.
const analyze = withBundleAnalyzer({ enabled: process.env.ANALYZE === "true" })

export default analyze(nextConfig)
