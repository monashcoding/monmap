# Changelog

Notable changes to MonMap, newest first. Version numbers follow
[Semantic Versioning](https://semver.org). Dates are when the last
change in the release landed on `main`.

## 2.0.1 (12 October 2026)

### Added

- Add a review from **My reviews**, or from a unit's menu in the planner.
- React to reviews with six fixed emoji, and sort reviews by reactions.
- Sort results on `/search`.

### Changed

- Old `/tree` and `/search` links to a unit, course or area of study
  now redirect to its page in one permanent redirect.
- The server keeps rendered pages in memory only, so the page cache no
  longer fills the server disk.
- Page views are counted in Postgres.
- Crawlers no longer follow **Plan this course** links.

### Fixed

- Your own reactions show in grey instead of yellow.

## 2.0.0 (6 October 2026)

The revamp. MonMap gets a new look, a new plan model, handbook pages
and student reviews.

### Added

- **Plan timeline.** A plan starts at your intake and can include
  leave, exchange and part-time semesters. MonMap projects when you
  finish.
- **First-run setup.** Three questions build your first plan.
- **Results mode.** Enter marks and see your WAM and GPA.
- **Plan map.** A read-only requisite map of your plan, under the
  planner and on the plans page.
- **Handbook pages** for every unit, course and area of study, with
  full-text search.
- **Ratings and reviews** for units, courses and areas of study, with
  automatic moderation and a **My reviews** page.
- Course trees follow links to earlier handbook years, and the planner
  marks units that come from an earlier year.
- Phone support: long-press drag in the planner, a **Move to** menu,
  and handbook pages laid out for small screens.

### Changed

- The MAC charcoal and yellow palette, with dark mode.
- A new top bar with Feedback and Contribute links.
- The planner is laid out as sheets of paper, with Credit, Print and
  Export in the plan toolbar.
- Print and CSV export use the planner's own layout.
- The Unit Tree page is now **Search Units & Courses** at `/search`.
- All dependencies upgraded, including Next.js 16.3.8.

### Fixed

- Blank course credit points and placeholder units are recovered at
  ingest.
- Sections that the handbook describes as "either/or" are treated as a
  choice.
- MonMap says so when Monash hasn't published a course's structure.

### Security

- Next.js upgraded to clear the image optimizer RCE and server action
  DoS advisories.
- Hardened auth, review moderation, analytics privacy and handbook HTML
  sanitising, and added security headers.
- CI runs lint, typecheck, tests and a dependency audit before it
  builds the image.

## 1.3.1 (5 September 2026)

### Fixed

- Printing a plan prints a formatted document instead of the app
  ([#48](https://github.com/monashcoding/monmap/pull/48)).

## 1.3.0 (31 August 2026)

Fixes and features from the May 2026 feedback form.

### Added

- Plan a second major or minor, with a warning when a unit counts
  toward two areas of study
  ([#46](https://github.com/monashcoding/monmap/pull/46),
  [#47](https://github.com/monashcoding/monmap/pull/47)).
- Pick a campus, and see which campus each area of study is offered at
  ([#36](https://github.com/monashcoding/monmap/pull/36),
  [#45](https://github.com/monashcoding/monmap/pull/45)).
- Record credit and advanced standing
  ([#39](https://github.com/monashcoding/monmap/pull/39)).
- Place a unit you failed and retook
  ([#34](https://github.com/monashcoding/monmap/pull/34)).

### Fixed

- Double degrees no longer offer their components' whole area of
  study catalogue or a specialisation's technical electives
  ([#35](https://github.com/monashcoding/monmap/pull/35)).
- The **Core** badge matches what auto-fill adds
  ([#37](https://github.com/monashcoding/monmap/pull/37)).
- Courses no longer ask for units the degree rules out
  ([#38](https://github.com/monashcoding/monmap/pull/38)).
- A prohibition conflict is flagged on both units
  ([#40](https://github.com/monashcoding/monmap/pull/40)).
- Arts majors are no longer mistaken for extended majors
  ([#43](https://github.com/monashcoding/monmap/pull/43)).
- The signed-out header no longer flashes on load
  ([#42](https://github.com/monashcoding/monmap/pull/42)).

## 1.2.1 (8 July 2026)

### Changed

- MonMap moves from Vercel to a self-hosted server on Oracle Cloud and
  Dokploy. CI builds the Docker image and pushes it to GHCR
  ([#28](https://github.com/monashcoding/monmap/pull/28),
  [#29](https://github.com/monashcoding/monmap/pull/29)).

## 1.2.0 (2 July 2026)

### Added

- Pick an area of study for each component of a double degree
  ([#23](https://github.com/monashcoding/monmap/pull/23)).

### Changed

- Sign-in uses the central MAC login at auth.monashcoding.com
  ([#17](https://github.com/monashcoding/monmap/pull/17)).
- Per-unit and per-course pages are retired in favour of the `/tree`
  page ([#18](https://github.com/monashcoding/monmap/pull/18)).

### Fixed

- Course templates, requirements and areas of study now resolve for
  every course, including double degrees
  ([#19](https://github.com/monashcoding/monmap/pull/19),
  [#20](https://github.com/monashcoding/monmap/pull/20),
  [#22](https://github.com/monashcoding/monmap/pull/22)).

## 1.1.1 (22 June 2026)

### Fixed

- Full-year units are no longer counted twice in a semester
  ([#15](https://github.com/monashcoding/monmap/pull/15)).
- The course picker shows all courses instead of the first 300
  ([#16](https://github.com/monashcoding/monmap/pull/16)).
- Templates for Design/IT, CS+Commerce and CS+Science double degrees.

## 1.1.0 (4 June 2026)

### Added

- Equivalent units count toward prerequisites
  ([#12](https://github.com/monashcoding/monmap/pull/12)).

### Fixed

- Prerequisites stored in a unit's enrolment rules are no longer
  missed ([#6](https://github.com/monashcoding/monmap/pull/6)).
- Contrast and layout fixes in the Unit Tree and Feedback panel
  ([#8](https://github.com/monashcoding/monmap/pull/8),
  [#9](https://github.com/monashcoding/monmap/pull/9),
  [#10](https://github.com/monashcoding/monmap/pull/10),
  [#11](https://github.com/monashcoding/monmap/pull/11)).

## 1.0.0 (19 May 2026)

Public launch, ahead of MonPlan's shutdown on 2 June 2026.

### Added

- Sign in with Google to save several plans across devices.
- A **My plans** page, with duplicate and per-plan starting year.
- Grades and a running WAM with Monash level weighting.
- Undo and redo for plan edits.
- Auto-fill from a course map, in prerequisite order.
- A two-pane unit search with slot-fit hints and personalised
  suggestions.
- The **Unit Tree** page for prerequisite graphs.
- Pages for every unit and course, with link previews.
- Every page works on phones.
- The AGPL-3.0 license.

## 0.1.0 (21 April 2026)

First prototype: a MonPlan-style planner over a Postgres copy of the
Monash handbook, with the scraper and ingest pipeline.
