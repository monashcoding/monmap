# SEO

## The problem

Most of a handbook page's text is copied from handbook.monash.edu.
Google groups pages that repeat another site's text and indexes one
copy, which is Monash's. MonMap also has 8 handbook years, and each
year of each code had its own URL: about 35,000 near-identical unit
pages, plus about 2,300 units, 120 courses and 420 areas of study that
are no longer in the handbook. A site with that much repeated content
gets crawled slowly and ranks poorly across the board.

## The angle

MonMap ranks for what the handbook doesn't have. Its two flagship
features give every page content of its own:

1. **Student reviews and ratings.** The searches are "FIT2004
   review", "is FIT2004 hard" and "Monash unit reviews".
2. **The planner and the requisite graph.** The searches are "FIT2004
   prerequisites", "what can I take after FIT1045" and "Monash course
   planner" or "C2001 course map".

Page titles name both: "FIT2004 Algorithms and data structures:
Reviews & Prerequisites", "Bachelor of Computer Science (C2001):
Reviews & Course Map", "Software development Major (SFTWRDEV08):
Reviews & Units".

## What is indexed

`resolveEntity` (`lib/handbook/resolve.ts`) sets `indexable`:

- Indexed: the bare URL (`/units/FIT2004`) of a code that is in either
  of the two newest handbooks.
- `noindex, follow`: every `/[year]` URL, and retired codes. They stay
  reachable for students and their links are followed.
- `/search` with a query, tab or filter is `noindex, follow`, as
  before.

The sitemaps (`/sitemaps/*.xml`) list only indexed URLs: about 5,500
units, 560 courses and 690 areas of study. A page with published
reviews gets `lastmod` (its newest review), priority 0.8 and a weekly
change frequency, so crawlers revisit the pages that change.

Links to older years carry `rel="nofollow"`, and the year picker uses
the router, so crawlers don't spend their visits on noindex pages.

## Unique content on every page

`lib/handbook/summary.ts` writes it from MonMap's data, and
`lib/handbook/facts.ts` gathers the facts from the page's data.

- **Summary** under the title (`unitLede`, `courseLede`, `aosLede`):
  level, credit points, faculty, when and where it runs, its
  prerequisites in words, how many units it unlocks and leads to
  (from the requisite graph, four steps on), and its rating and
  difficulty.
- **Common questions** (`unitQuestions` and the others): "What are the
  prerequisites for FIT2004?", "What can I take after FIT2004?", "Is
  FIT2004 hard?", "Does FIT2004 have an exam?", "Which majors include
  FIT2004?". A question only appears when the data answers it, so no
  page gets filler. The questions are visible headings; there's no
  FAQPage markup, because Google shows FAQ results only for government
  and health sites.
- **Reviews**, server-rendered, with `aggregateRating` and `review`
  JSON-LD on unit pages.
- **Meta descriptions** in MonMap's words (rating, prerequisites,
  unlocks, offerings), never the handbook synopsis. Sentences are
  dropped whole to fit 160 characters.

Monash's own prose (`Prose` in `components/handbook/parts.tsx`) carries
`data-nosnippet`, so search results quote MonMap's summary instead.

## Structured data

- Units: `Course` with `coursePrerequisites`, `hasCourseInstance` (one
  per period and campus), `aggregateRating` and `review`.
- Courses: `EducationalOccupationalProgram`. Areas of study:
  `WebPage`. Each page has a `BreadcrumbList`.
- Home: `WebApplication`. `/search`: `WebSite` with a `SearchAction`.

## Crawl paths

- `/courses` and `/aos` list every current course and area of study,
  grouped, with ratings. Course and area of study breadcrumbs point to
  them.
- The home page has an `h1` and an "About" section under the planner.
  It lists the courses students plan most and links to the hubs.
- Unit pages link to each other through requisites, unlocks and
  structures; courses link to their areas of study and units.

## The planner

Course pages have a "Plan this course" button: `/?course=C2001&year=2027`.
With no saved plan the planner opens that course. Over a saved plan it
offers "Switch to C2001" instead of replacing the plan.

## After a deploy

1. Submit `/sitemap.xml` in Google Search Console.
2. Watch Pages > "Crawled - currently not indexed" and "Duplicate,
   Google chose different canonical". Both should shrink as the year
   pages drop out.
3. Optionally run the warm-up script (`docs/handbook-pages.md`) so
   first crawls are fast.

Reviews are the main lever: a page with reviews has the most content
no other site has.
