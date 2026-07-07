# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# MonMap webapp — self-hosted image (Oracle Cloud + Dokploy).
#
# Build context is the MONOREPO ROOT (not packages/webapp) so pnpm can
# resolve the workspace deps `@monmap/db` and `@monmap/scraper`, which the
# webapp imports as raw TS and Next compiles via `transpilePackages`.
#
# Only NEXT_PUBLIC_* vars are needed at build time (they get baked into the
# client bundle). The DB is NOT touched during `next build` — no SSG/sitemap
# query — so DATABASE_URL is a *runtime*-only var, set in Dokploy.
# ---------------------------------------------------------------------------

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# ---- deps + build -------------------------------------------------------
FROM base AS build

# The root `prepare` script runs husky, which needs a .git dir we don't
# ship. HUSKY=0 makes it a no-op during the image build.
ENV HUSKY=0

# Copy the whole workspace and install with a cached pnpm store.
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# NEXT_PUBLIC_* must exist at build time — they're inlined into the client
# bundle. Pass them via --build-arg (Dokploy: Build → Build Args).
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_AUTH_URL
ARG NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
ARG NEXT_PUBLIC_POSTHOG_HOST
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL \
    NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=$NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN \
    NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST \
    NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter webapp build

# ---- runtime ------------------------------------------------------------
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as a non-root user.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# `output: "standalone"` + `outputFileTracingRoot` = repo root means the
# standalone tree mirrors the monorepo layout: server.js sits under
# packages/webapp/. Static assets and public/ aren't traced, so copy them.
COPY --from=build --chown=nextjs:nodejs /app/packages/webapp/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/packages/webapp/.next/static ./packages/webapp/.next/static
COPY --from=build --chown=nextjs:nodejs /app/packages/webapp/public ./packages/webapp/public

USER nextjs
EXPOSE 3000
CMD ["node", "packages/webapp/server.js"]
