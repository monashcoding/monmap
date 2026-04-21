# monmap

A MonPlan-style Monash course planner. Single Next.js app backed by a
Postgres copy of Monash's handbook, ingested from a packaged JSON
corpus (`monmap-handbook-*.tar.gz`) that ships with the repo.

## Stack

- **pnpm workspace** with four packages: `scraper`, `db`, `ingest`,
  `webapp`.
- **Postgres** (local) — accessed via Drizzle ORM.
- **Next.js 16 App Router** for the webapp.

Conventions live in [`CLAUDE.md`](CLAUDE.md). Data-shape gotchas live
in [`docs/handbook-internals.md`](docs/handbook-internals.md). Skim
the latter before writing queries — several fields silently lie.

## Prerequisites

- Node ≥ 22 (tested on 25.8)
- pnpm ≥ 10
- Postgres ≥ 14 running locally

## First-time setup

```bash
# 1. Install workspace deps
pnpm install

# 2. Configure env at the repo root (one .env — CLAUDE.md §1)
cp .env.example .env
# Edit DATABASE_URL if your Postgres isn't on localhost:5432/monmap

# 3. Create the database and apply migrations
createdb monmap
pnpm db:migrate

# 4. Unpack the handbook corpus into ./data
tar -xzf monmap-handbook-*.tar.gz

# 5. Load it into Postgres (~5k units, ~500 courses, ~10k offerings)
pnpm ingest
```

## Running the app

```bash
pnpm --filter webapp dev         # http://localhost:3000
```

## Day-to-day commands

```bash
pnpm db:generate                 # after editing schema.ts, write a new migration
pnpm db:migrate                  # apply pending migrations
pnpm db:studio                   # open drizzle-kit's db browser

pnpm --filter webapp test        # pure-function unit tests (node --test)
pnpm --filter webapp typecheck

pnpm scrape                      # re-scrape the live handbook for one year
pnpm scrape:all                  # …for every published year
pnpm package                     # roll a new monmap-handbook-YYYYMMDD.tar.gz
```

> `drizzle-kit push` is deliberately not wired up. Schema changes go
> through `db:generate` + `db:migrate` so the history stays auditable
> (CLAUDE.md §2).

## Repo layout

```
packages/
  scraper/   CourseLoop → ./data/raw JSON
  db/        Drizzle schema, migrations, shared client
  ingest/    ./data/raw → Postgres, builds graph-edge tables
  webapp/    Next.js planner UI (single page)
data/
  raw/       Unpacked per-year JSON (gitignored — lives in the tarball)
  manifest.json
docs/
  handbook-internals.md
monmap-handbook-YYYYMMDD.tar.gz  Latest packaged corpus
```
