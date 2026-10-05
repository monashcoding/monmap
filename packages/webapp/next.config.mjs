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
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://us-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ]
  },
  // Required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
}

// Enable with `ANALYZE=true pnpm build` — writes HTML reports under
// .next/analyze/{client,nodejs,edge}.html.
const analyze = withBundleAnalyzer({ enabled: process.env.ANALYZE === "true" })

export default analyze(nextConfig)
