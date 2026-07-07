import { config } from "dotenv"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import withBundleAnalyzer from "@next/bundle-analyzer"

// Load the monorepo-root .env *before* Next.js boots, so server
// components can see DATABASE_URL. Next's built-in dotenv only looks
// inside the package, but CLAUDE.md §1 says one .env, at the repo
// root — see that file for rationale.
const here = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(here, "../../.env") })

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

  // The per-entity SEO pages (/units/[code], /courses/[code]) were
  // retired — their lazy-ISR rendering blew through Vercel's free-tier
  // ISR/edge quotas. The workbench at /tree is the single SPA now;
  // these redirects keep previously shared/indexed entity URLs working.
  // Extra query params (?direction=, ?aos=) pass through untouched.
  async redirects() {
    return [
      {
        source: "/units/:code",
        destination: "/tree?unit=:code",
        permanent: true,
      },
      {
        source: "/courses/:code",
        destination: "/tree?course=:code",
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
