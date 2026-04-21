# monmap conventions

Rules that every package in this monorepo must follow.

## 1. `.env` lives at the repository root

There is exactly one `.env` file, at the repo root. Packages do **not** ship
their own `.env` or read from `packages/*/`. Anything that needs env vars
(drizzle config, the ingest CLI, future web servers) must resolve the
root `.env` explicitly — e.g.:

```ts
import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

config({
  path: resolve(fileURLToPath(import.meta.url), "../../../.env"),
});
```

If a new package needs a new env var, add it to the root `.env` (and its
documented `.env.example`), never fragment configuration across packages.

## 2. Drizzle: generate + migrate, never push

The workflow is:

```bash
pnpm db:generate      # write a new SQL migration file to packages/db/drizzle/
pnpm db:migrate       # apply pending migrations to the database in DATABASE_URL
```

`drizzle-kit push` is **not** available as a script and must not be added.
Push bypasses the migration history — great for throwaway prototypes,
disastrous for a shared dev/prod DB where you want an auditable log of
every schema change. Always go through a reviewed migration file.
