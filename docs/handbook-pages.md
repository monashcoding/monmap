# Handbook pages

MonMap has a public page for every unit, course and area of study in
the handbook data, and a search page over all of them.

## Routes

| Route                                       | Shows                                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `/search`                                   | One search box over units, courses and areas of study for one handbook year, with tabs, filters and pages. |
| `/units/[code]`                             | A unit's latest handbook year.                                                                             |
| `/units/[code]/[year]`                      | A unit in one earlier year.                                                                                |
| `/courses/[code]`, `/courses/[code]/[year]` | The same for courses.                                                                                      |
| `/aos/[code]`, `/aos/[code]/[year]`         | The same for areas of study.                                                                               |
| `/courses`, `/aos`                          | Every current course, or area of study, grouped, with ratings.                                             |

The segment names copy handbook.monash.edu, so a Monash URL becomes a
MonMap URL by changing the domain.

- The bare URL is canonical, and every year page names it as its
  canonical (see [`seo.md`](seo.md)).
- A lowercase code redirects to the uppercase one (308).
- A year with no page for the code redirects to the bare URL (307).
- An unknown code is a 404.
- `/search?unit=`, `?course=` and `?aos=` (the old search screen's links)
  redirect to the matching page. `/tree` redirects to `/search`.
- `/courses` and `/aos` render from `app/hubs/[hub]/page.tsx`:
  `next.config.mjs` rewrites both URLs there, so the hubs are cached for
  a day like the pages they list. A direct visit to `/hubs/courses` or
  `/hubs/aos` redirects to `/courses` or `/aos` (308), so each hub has
  one URL.

The page components live in `packages/webapp/components/handbook/`.
Their data comes from `lib/db/handbook.ts`. The raw-JSON readers are
in `lib/handbook/raw.ts`, and the curriculum tree walker is in
`lib/handbook/curriculum-tree.ts`.

## Search

`searchHandbook` in `lib/db/handbook.ts` runs one query over the three
tables for one year. Each table first keeps only rows that can match,
then ranks them in tiers:

1. Exact code, then code prefix.
2. Whole title, a course abbreviation ("BCompSci"), title prefix, a
   word in the title starting with the query, then the query anywhere
   in the title.
3. Every word of the query in the title or code ("comp sci").
4. A full-text match over the title and handbook prose. The words are
   stemmed and prefix-matched, so "algorithm" finds "algorithms".
5. A trigram match on the title, for typos ("algoritms").

Migration `0014_add_search_indexes` supports this:

- a stored, weighted `search_vector` column on `units`, `courses` and
  `areas_of_study`, each with a GIN index;
- trigram GIN indexes on area of study titles and codes (units and
  courses already had them);
- btree indexes on `code` for lookups across years.

With these, a search spends 10-35 ms in Postgres, down from 140-220 ms.
A query that is a code the year lacks (FIT2004 in 2027) points to the
latest year that has it.

## Sorting

The `sort` parameter picks the order of /search results:

| Sort | Order |
| --- | --- |
| Default | With a query, relevance first (the tiers above). Without one, a score: `3·ln(1+reviews) + 2·ln(1+core) + ln(1+views) + ln(1+planners)`. |
| A to Z | Title. |
| Highest rated | Mean overall stars, counted as if every entity had 2 extra 3-star reviews. Entities with no reviews go last. |
| Easiest first | Mean review difficulty, with the same 2 extra 3s. Entities with no difficulty ratings go last. |
| Most reviews | Published review count. |
| Most planned | Distinct students with it on a plan. |

Reviews are read live. The other numbers come from a snapshot that
`lib/db/entity-stats.ts` rebuilds once a day:

- `planners`: distinct users with the entity on any plan (units in a
  slot, the course, a picked area of study). A count under 5 is stored
  as 0 and never shown, so a rare unit cannot point at the student who
  plans it. The daily snapshot means that one student's change cannot
  be matched to a change in a count.
- `views`: daily unique visitors over the last 90 days.
- `unit_core.sources`: per handbook year, the courses whose mandatory
  requirement groups name the unit, plus the areas of study that list
  it under "Core units".

Views are a Default input only; there is no "Most viewed" sort.

The first /search or `/api/views` request after the snapshot turns a
day old starts a rebuild in the background. An advisory lock keeps it
to one server at a time, and `job_run` records when it finished. To
rebuild now, run `pnpm --filter webapp refresh:stats`.

### Page views

Unit, course and area of study pages send one `POST /api/views` from
the browser (`components/handbook/view-beacon.tsx`). The route:

1. drops requests with no IP address or with a crawler or script user
   agent;
2. keys the visitor with an HMAC of the Melbourne date, the IP address
   (`cf-connecting-ip`) and the user agent, under `VIEW_KEY_SECRET`;
3. stores one `entity_view` row per visitor, page and day, and only
   for codes in the handbook;
4. always answers 204.

No IP address is stored, and the date in the key means a visitor
cannot be linked across days. The daily rebuild rolls finished days
into `entity_view_daily` counts and deletes their `entity_view` rows,
so a visitor key lasts about a day.

## Links between pages

- Every unit, course and area of study named on a page links to its
  page: requisites, "Leads to", equivalents, curriculum items, areas of
  study and the courses that offer an area of study.
- Handbook links inside Monash's HTML prose (enrolment rules, notes)
  are rewritten to MonMap pages by `rewriteHandbookHtml`, on the pages
  and in the unit detail panels of the planner and the requisite maps.
- On a year page, links keep that year. On a latest-year page they go
  to bare URLs.
- A code with no page in any year renders as plain text.

## Caching and the build

The Docker build has no database, so it renders no handbook pages.

- Each page and share image renders on its first request. Next caches
  page HTML for a day and share images for a week (`revalidate`, an
  empty `generateStaticParams`). A share image for a code that is not
  in the handbook is a 404, like its page.
- Saving, deleting or moderating a review drops the cached HTML of
  that entity's pages (`revalidatePath` for the bare URL and each
  year) and of its hub (`/hubs/courses` or `/hubs/aos`, the path the
  ISR entry is stored under). The day limit bounds how stale the stars
  on other pages' lists can get.
- The queries behind a page are also memoised in process for an hour
  (`cacheHandbook`).
- The handbook GET routes under `/api` let a shared cache keep an
  answer for a day and serve it stale for one more day
  (`HANDBOOK_CACHE` in `lib/api/server.ts`). An empty answer to missing
  or invalid input gets `max-age=60` only (`EMPTY_CACHE`).
- After a re-ingest, redeploy to clear both caches. A redeploy does not
  clear a CDN: if a Cloudflare cache rule covers `/api/*`, purge it
  too, or old API answers can last up to two more days.

To fill the cache after a deploy without a burst of load, run the
warm-up script from any machine. It reads the sitemap and requests each
page, 2 at a time with a 200 ms pause:

```bash
pnpm --filter webapp warm:pages --base https://monmap.monashcoding.com
```

At about 1 page a second, the full set of about 6,800 pages (the
current codes the sitemaps list) takes roughly 2 hours. Use `--only courses`, `--only aos` or `--limit` to
warm a part first.

## SEO

See [`docs/seo.md`](seo.md) for the strategy: what is indexed, why, and
where each page's unique content comes from.
