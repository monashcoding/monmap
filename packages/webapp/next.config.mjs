import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import withBundleAnalyzer from "@next/bundle-analyzer";

// Load the monorepo-root .env *before* Next.js boots, so server
// components can see DATABASE_URL. Next's built-in dotenv only looks
// inside the package, but CLAUDE.md §1 says one .env, at the repo
// root — see that file for rationale.
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Let pages that touch DB data silently flip to dynamic rendering.
  experimental: {
    // no-op placeholder; keeps the block available for future tuning
  },
};

// Enable with `ANALYZE=true pnpm build` — writes HTML reports under
// .next/analyze/{client,nodejs,edge}.html.
const analyze = withBundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

export default analyze(nextConfig);
