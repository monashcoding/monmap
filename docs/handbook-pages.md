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

The segment names copy handbook.monash.edu, so a Monash URL becomes a
MonMap URL by changing the domain.

- The bare URL is canonical. A year page for the code's latest year
  sets its canonical to the bare URL.
- A lowercase code redirects to the uppercase one (308).
- A year with no page for the code redirects to the bare URL (307).
- An unknown code is a 404.
- `/search?unit=`, `?course=` and `?aos=` (the old search screen's links)
  redirect to the matching page. `/tree` redirects to `/search`.

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

## Links between pages

- Every unit, course and area of study named on a page links to its
  page: requisites, "Leads to", equivalents, curriculum items, areas of
  study and the courses that offer an area of study.
- Handbook links inside Monash's HTML prose (enrolment rules, notes)
  are rewritten to MonMap pages by `rewriteHandbookHtml`.
- On a year page, links keep that year. On a latest-year page they go
  to bare URLs.
- A code with no page in any year renders as plain text.

## Caching and the build

The Docker build has no database, so it renders no handbook pages.

- Each page and share image renders on its first request. Next caches
  page HTML for a day and share images for a week (`revalidate`, an
  empty `generateStaticParams`).
- Saving, deleting or moderating a review drops the cached HTML of
  that entity's pages (`revalidatePath` for the bare URL and each
  year). The day limit bounds how stale the stars on other pages'
  lists can get.
- The queries behind a page are also memoised in process for an hour
  (`cacheHandbook`).
- After a re-ingest, redeploy to clear both caches.

To fill the cache after a deploy without a burst of load, run the
warm-up script from any machine. It reads the sitemap and requests each
page, 2 at a time with a 200 ms pause:

```bash
pnpm --filter webapp warm:pages --base https://monmap.monashcoding.com
```

At about 1 page a second, the full set of about 10,000 pages takes
roughly 3 hours. Use `--only courses`, `--only aos` or `--limit` to
warm a part first.

## SEO

See [`docs/seo.md`](seo.md) for the strategy: what is indexed, why, and
where each page's unique content comes from.
