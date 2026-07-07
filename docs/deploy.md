# Deploying MonMap (Oracle Cloud + Dokploy)

MonMap runs as a Docker container on an Oracle Cloud VM, fronted by
[Dokploy](https://dokploy.com). It moved off Vercel when the free-tier
usage limits stopped the deployment.

## Architecture: build off-box, run on-box

The Oracle VM is shared by several apps (monmap, mploy, monashcoding).
A Docker build peaks at 2–4 GB RAM and pegs the CPU; three of those
racing on one box is how you OOM production. So **we never build on the
Oracle box**:

```
push to main ──▶ GitHub Actions (ubuntu-24.04-arm)
                   │  builds linux/arm64 image
                   ▼
                 GHCR: ghcr.io/monashcoding/monmap:latest
                   │  Dokploy pulls (webhook-triggered)
                   ▼
                 Oracle VM: `node server.js`  (~200–400 MB idle)
```

The box only ever runs the finished containers, so it comfortably holds
all three apps + Postgres + Dokploy on a 4 OCPU / 24 GB Ampere A1.

Reuse this exact pattern for mploy and monashcoding: a `Dockerfile`, a
`.github/workflows/deploy.yml` that pushes to GHCR, and a Dokploy app
that deploys from the image.

## One-time GitHub setup

1. **Repo Variables** (Settings → Secrets and variables → Actions →
   _Variables_). All browser-public, so Variables not Secrets:
   - `NEXT_PUBLIC_SITE_URL` = `https://monmap.monashcoding.com`
   - `NEXT_PUBLIC_AUTH_URL` = `https://auth.monashcoding.com`
   - `NEXT_PUBLIC_POSTHOG_HOST` = `https://us.i.posthog.com`
   - `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` = _(PostHog project token)_
   The workflow has fallbacks for all but the PostHog token.
2. **Repo Secrets** for the redeploy trigger. The Dokploy panel is bound
   to `localhost` on the box (SSH-tunnel access only, never exposed to the
   internet), so GitHub can't POST to it directly — CI instead SSHes into
   the box and fires the webhook from there. Add:
   - `DOKPLOY_DEPLOY_WEBHOOK` = the localhost URL Dokploy shows, e.g.
     `http://localhost:3000/api/deploy/<token>` (added after Dokploy setup)
   - `ORACLE_SSH_HOST` = the box's public IP/hostname (SSH is already open)
   - `ORACLE_SSH_USER` = SSH login user (e.g. `ubuntu` / `opc`)
   - `ORACLE_SSH_KEY` = a private key authorized on the box (`ssh-keygen -t
     ed25519 -f deploy_key`, append `deploy_key.pub` to the box's
     `~/.ssh/authorized_keys`, paste `deploy_key` into this secret)
   Until the SSH secrets exist, the workflow builds/pushes but skips the
   redeploy trigger. (Alternative: expose the Dokploy panel on an HTTPS
   domain and POST the webhook directly — but that publishes the admin UI,
   so the SSH route is preferred here.)
3. **Make the GHCR package public** (or give Dokploy a read token) so the
   VM can pull without auth: after the first push, open the package at
   `github.com/orgs/monashcoding/packages`, → Package settings →
   change visibility to Public.

## One-time Dokploy setup

1. **Create Application** → Provider: **Docker**.
   - Image: `ghcr.io/monashcoding/monmap:latest`
   - (If you kept the package private: add GHCR registry credentials — a
     GitHub PAT with `read:packages`.)
2. **Environment** (runtime vars):
   ```
   DATABASE_URL=postgres://<user>:<pass>@<oracle-private-ip>:5432/<db>
   AUTH_URL=https://auth.monashcoding.com
   JWT_AUDIENCE=mac-suite
   DB_POOL_MAX=10
   NEXT_PUBLIC_SITE_URL=https://monmap.monashcoding.com
   NEXT_PUBLIC_AUTH_URL=https://auth.monashcoding.com
   NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
   NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=<token>
   ```
   Postgres is on the same box; `localhost` inside the container is the
   container, not the host — use the Oracle **private IP** (or the Docker
   host gateway) and make sure `pg_hba.conf`/`listen_addresses` allow it.
3. **Port**: container listens on `3000`.
4. **Domains**: add `monmap.monashcoding.com` → container port `3000` →
   enable HTTPS (Let's Encrypt). Point the DNS A record at the VM.
5. **Deploy webhook**: copy the app's deploy webhook URL (Dokploy shows it
   as `http://localhost:3000/api/deploy/<token>`) into the GitHub repo
   secret `DOKPLOY_DEPLOY_WEBHOOK`, and set the `ORACLE_SSH_*` secrets
   (GitHub setup step 2). CI SSHes into the box and fires that localhost
   URL, so each pushed image auto-redeploys without exposing the panel.

## Deploying a change

Just push to `main`. GitHub Actions builds + pushes the image, then hits
the Dokploy webhook, which pulls and restarts the container. Watch the
run under the repo's Actions tab; watch the pull/restart in Dokploy.

To deploy manually: Actions → **Build & publish image** → _Run workflow_,
then hit **Deploy** in Dokploy.

## Notes

- `next build` does **not** touch the database (no SSG/sitemap query), so
  `DATABASE_URL` is a runtime-only var. Only `NEXT_PUBLIC_*` are baked in
  at build time (they're client-bundle values) — hence build-args.
- The app is a long-lived server talking directly to Postgres, so it uses
  a real pool (`DB_POOL_MAX`, default 10) with prepared statements — not
  the `max: 1` serverless default in `packages/db`. Keep
  `replicas × DB_POOL_MAX` well under Postgres `max_connections` (100).
- Database migrations are still run manually: `pnpm db:migrate` against
  `DATABASE_URL` (see CLAUDE.md §2). The container does not migrate on boot.
