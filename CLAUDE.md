# monmap conventions

Rules that every package in this monorepo must follow.

**Before writing a query or UI view against the handbook data**, skim
[`docs/handbook-internals.md`](docs/handbook-internals.md) — it
captures the non-obvious shape of Monash's data (CourseLoop field
conventions, what the tree JSONB looks like, fields that silently
lie about their content, cross-year references) that won't be
apparent from the schema or the column names alone.

## Where things live

| Path | Contents |
| --- | --- |
| `packages/webapp` | The Next.js app: planner, handbook pages, reviews, search. |
| `packages/db` | Drizzle schema (`src/schema.ts`), migrations (`drizzle/`), shared Postgres client. |
| `packages/scraper` | Fetches handbook data from CourseLoop into `packages/scraper/data`. |
| `packages/ingest` | Loads the scraped data into Postgres. |

Read the matching doc before you change one of these areas:

| Area | Doc |
| --- | --- |
| Handbook pages, search, sorting, caching, ISR | [`docs/handbook-pages.md`](docs/handbook-pages.md) |
| Reviews, reactions, moderation | [`docs/reviews.md`](docs/reviews.md) |
| Metadata, sitemaps, canonical URLs | [`docs/seo.md`](docs/seo.md) |
| Majors, minors, campus preference | [`docs/plan-multiple-aos.md`](docs/plan-multiple-aos.md) |

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

Never edit a migration file that is already on `main`: production has
applied it, so a change there never runs. Write a new migration instead.

## 3. Never start the Next.js dev server yourself

The user runs `pnpm dev` themselves. Don't spawn it, don't background it,
don't "just smoke-test it" — `next dev` holds a lockfile at
`packages/webapp/.next/dev/lock`, and a second instance fights the
user's instance over the port and the lock, leaves orphaned processes,
and corrupts the build cache. Same applies to `next start` and any
other long-running server.

To verify a route, write a unit test or use the user's server. If
`packages/webapp/.next/dev/lock` exists, the user's server is running
and you can open http://localhost:3000 in a browser. If it is not
running, ask the user to start it.

## 4. Yellow surfaces pair with `text-primary-foreground`, never `text-primary`

`--primary` is Monash yellow (`#ffe330`). Yellow text on a yellow tint
(`bg-primary/15 text-primary` and friends) is unreadable. The brand
defines `--primary-foreground` as `#252525` (MAC charcoal ink) for exactly
this pairing — use it on any yellow-tinted chip, badge, or pill, and
bump the tint (≈`/40`) so the surface still reads as yellow rather
than gray.

## 5. Analytics never carries personal data

- Client code sends PostHog events only through `lib/analytics.ts`. An
  eslint rule blocks direct `posthog-js` imports.
- Server code sends events only through `captureServer` in
  `lib/posthog-server.ts`.
- No event, property or label may carry an email, a name, a plan name
  or a grade.
- Page views for the `/search` sorts are counted in Postgres, not PostHog.

Keep the user's name and plan names out of `aria-label` and `title`
too. `lib/analytics.ts` masks element attributes, and this rule keeps
names out of captured data if that masking ever changes.

## 6. UI must work in dark mode and on phones

- Use the theme tokens in `app/globals.css`, never raw colours, so dark
  mode follows.
- Check every UI change at phone width (below the `md` breakpoint).
  Below `md`, give a small icon button a bigger tap area with
  `TOUCH_HIT` or `TOUCH_HIT_ROW` from
  `components/planner/touch-target.ts`, or with `max-md:min-h-11`.
- `app/globals.css` keeps text fields at 16px or more below `md`, so
  iOS does not zoom the page. Do not override it.
- In UI text, use plain hyphens, not middle dots (·) or em dashes (—).

## 7. Before you finish

Run these and make sure that they pass:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

The git hooks run the same checks:

- `pre-commit` runs prettier and eslint on the staged webapp files.
- `pre-push` runs `typecheck`, `test` and a full `pnpm build`. A push
  takes a few minutes, and a build failure blocks it.

CI runs lint, typecheck, tests and `pnpm audit` on every pull request.
On `main`, CI then builds the Docker image and redeploys the live site,
so a push to `main` ships.

## 8. Commits

Write the subject as a plain sentence about what changes for the user
or the code: "Let students react to reviews with six fixed emoji", not
`feat(reviews): add reactions`. Do not use a conventional-commit prefix.
Work on `main` unless the user asks for a branch.

## 9. Dependencies

- Do not install a version published less than 7 days ago. Make an
  exception only for a security fix, and say so in the commit.
- Keep the TypeScript, ESLint and `@types/node` majors where they are.
  typescript-eslint supports TypeScript below 6.1, Next's lint plugins
  support ESLint 9, and `@types/node` follows the Node 24 runtime in
  the Docker image. `.github/dependabot.yml` holds the same list.
- Keep exactly one `drizzle-orm` version. `pnpm-workspace.yaml` and
  `.npmrc` pin it; a second copy breaks typechecking.
