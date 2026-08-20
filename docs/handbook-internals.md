# Handbook data notes

Non-obvious facts about how Monash's handbook data is shaped — what
it looks like inside a record, what fields mean what, and which
fields silently lie about their content. Skim before building a UI
view or writing a query.

## CourseLoop reference shapes

The upstream CMS is CourseLoop; two distinct reference shapes appear
inside records. They look similar and confusing them silently produces
wrong data (not a type error).

**Full `CLReference` — `{value, cl_id, key}`.** Used for pointers at
other CourseLoop rows (school, teaching period, location). Extract
display text as `.value`:

```json
"school": { "value": "Faculty of Information Technology",
            "cl_id": "c5684a53...", "key": "name" }
```

**Lite-reference — `{label, value}`.** Used for classification
dropdowns (level, type, status, AQF level, attendance mode,
undergrad/postgrad). `.label` is human-readable ("Level 1", "Bachelor
Degree", "Accredited", "Undergraduate"); `.value` is the internal
code ("2", "7_bach_deg", "Active"). **Prefer `.label` for display**,
fall back to `.value`.

The one place you **must** use `.value`, not `.label`, is
`academic_item_type` inside tree leaves: `.label` is "Unit"/"Course"
(human), `.value` is "subject"/"course" (internal code). Filters in
the ingest pipeline check against `"subject"` — using the label
returns zero refs silently.

**Scalars-as-strings.** Numbers and booleans arrive as strings:
`credit_points: "6"`, `offered: "true"`. The DB columns have already
parsed these; if you reach into `raw` JSONB for a field we haven't
extracted, re-parse.

## Requisites vs enrolment rules are different things

Both live on units and both restrict enrolment, but they are not the
same thing:

- **`requisites`** (prerequisites, corequisites, prohibitions) carry a
  structured AND/OR tree of unit-code references in `rule` JSONB. The
  `description` field is **empty 99.9% of the time** — do not render
  it. The rule tree is the authoritative source.
- **`enrolment_rules`** are mostly program-level constraints ("must be
  enrolled in Bachelor of IT", "must have 48cp in Art, Design and
  Architecture"). They ship as HTML prose only — no structured tree —
  and they always have a populated `description`. Most you can't
  evaluate programmatically without NLP; just render the HTML.

  **The leaky exception:** ~2,340 unit-years (Science, Engineering,
  Pharmacy, Education) put their *unit-level* PREREQUISITE /
  PROHIBITION / CO-REQUISITE refs *here* instead of in `requisites`,
  as `<strong>PREREQUISITE</strong>: <a href=".../units/MTH1030">…`
  prose. So a unit with an empty `requisites` tree is **not**
  necessarily requisite-free — check `enrolment_rules` too. The ingest
  extractor (`packages/ingest/src/parse.ts`) and migration `0007`
  pull these into `requisite_refs`. Gotchas that bit the first pass:
  one description can carry several labels (121 mix PREREQ +
  PROHIBITION), the unit links use *both* the `handbook.monash.edu`
  and legacy `www.monash.edu/pubs/.../units/CODE.html` hosts, the same
  prose links to `/courses/` and `/aos/` (which must **not** become
  unit edges), and some units list themselves. Extraction is
  anchor-only and per-`<strong>`-section; plain-text codes ("…or
  MTH1040") are deliberately left unparsed (NLP-only; risks reading
  course codes like `4531`/`M6011` as units).

For graph-shaped queries on requisites ("what requires X?", "what
unlocks after X?"), use `requisite_refs` — it's the flat edge view of
the trees, **plus** the `enrolment_rules`-derived edges above. Use
`requisites.rule` only when you need AND/OR semantics for validation
("does this student's set of completed units satisfy this block?") —
note the rule tree does *not* include the `enrolment_rules` edges.

### Unit equivalence is encoded as a mutual prohibition

There is **no explicit "equivalent unit" field**. Monash expresses
equivalence (advanced twins like `FIT1045`/`FIT1053`, faculty
cross-listings like `FIT3184`/`ITI3184`, campus variants) as a
**mutual prohibition**: `A` prohibits `B` *and* `B` prohibits `A`.
That alone is not enough — mutual prohibition *also* covers pick-one
alternatives that are **not** equivalent (e.g. `ENG4105` "Biomedical
engineering integrated design" ⟂ `MAE4410` "Flight vehicle design",
two different final-year capstones you may only do one of). The
discriminator is **title equality** after normalising away a trailing
`(Advanced)`/`(Honours)`, case, and whitespace. In the 2026 corpus ~740
pairs mutually prohibit; ~406 also share a title and are the genuine
equivalents. The planner uses this (`fetchEquivalentsForCodes` →
`PlannerUnit.equivalents` → `withEquivalents`) so completing one twin
satisfies a prerequisite that names the other. Note prohibitions are
often **asymmetric** (1,557 of 3,041 edges in 2026 are one-directional),
so always check *both* directions before calling two units equivalent.

## Graph shape: what references what

- **Unit requisites only reference units** (`academic_item_type.value
  === "subject"`). Never courses. Verified across 7,354 leaf refs in
  the 2026 corpus — zero course refs.
- **AoS curriculum → units**, with a grouping label ("Core units",
  "Elective units", "Malaysia", etc.). 6,773 edges in 2026.
- **Course curriculum → AoS**, with the nearest ancestor container
  title naming the relationship ("Part B. Major studies", "Science
  extended majors", "Discipline elective studies"). 719 edges.
- **Double degrees own no AoS edges after 2022.** From the 2023
  handbook on, a double degree's tree is a skeleton whose top-level
  containers each hold one course reference (S2004 → `Course: S2000`
  + `Course: C2001`); the majors/minors/specialisations are linked on
  the *component* courses, not the double. S2004 has 60 direct
  `course_areas_of_study` rows in 2020–2022 and zero in 2023–2026 —
  and 96 of 2026's 110 double degrees have zero. Any query that
  wants a double degree's AoS must follow `courses.sub_course_refs`
  to the component courses and read their edges (this is what
  `fetchCourseWithAoS` does).
- **…but the 14 that DO own edges are narrowing the offer, not adding
  to it.** A parent that enumerates AoS *underneath* a component
  container is stating which of that component's options survive into
  the double: E3010's "Engineering specialisations: the following are
  specialisations available within this double-degree course" lists 3
  of E3001's 10, and its "Specialist discipline: you must complete the
  specialisation below" pins C2001 to `ALGSFTWR01` alone. Unioning
  parent + component edges (what we did until 2026-08) offered E3010
  41 AoS instead of 4 — Aerospace, Civil, Mechanical and friends all
  selectable. `fetchCourseWithAoS` now drops a component's edges for
  any **(component, kind)** pair the parent enumerates.
  Narrowing is scoped per kind because an enumeration of
  specialisations says nothing about minors. The 14 affected courses in
  2026: D3002/D3004/D3005/D3006/D3007 (Education doubles → Primary +
  Secondary only), E3004, E3005, E3007, E3008, E3009, E3010, E3011,
  E3012, L3002. Join parent edge → component via
  `courses.component_labels` (aosCode → depth-1 container title) and
  `sub_course_refs`, never via title strings.
- **A double degree takes only some Parts of each component, and AoS
  in the other Parts are unreachable.** The component container's prose
  says which ("You must complete 96 credit points from Parts A, B, C
  and D as described in the Bachelor of Computer Science" — 42+6+36+12,
  exactly C2001 minus its 48cp Part E). C2001's 5 discipline electives
  live in *Part E. Free elective studies*, so E3010 cannot offer them.
  Ingest bakes the parsed letters as `sub_course_refs[].includedParts`
  (`parseIncludedParts`); the reader matches them against the
  component's own container titles via `containerParts`. **Null means
  no signal — inherit everything**, which is the majority case and what
  every row baked before 2026-08 carries.
  Two traps: (1) AoS under a container that is *not* Part-numbered are
  out of scope too — E3001 parks its 22 minors in a top-level
  "Engineering minors" sibling whose own prose ends "Minors are also
  not available in the engineering double-degrees", which is the
  independent confirmation that dropping them is right. (2) **Guard on
  resolvability**: only filter when every letter the parent names maps
  to a real container of that component. D3001 numbers Parts A–E in
  prose but titles its containers "Specialisations", "Professional
  studies", …; without the guard five Education doubles lose every AoS
  they have. With both rules, 50 of 2026's 110 doubles narrow, every
  single drop lands in an elective/free-elective container, and none
  drops to zero AoS. E3010 goes 41 → 4.
- **Not every sub-course ref is a degree component.** Refs sharing a
  (trimmed) `componentTitle` are "pick one of these programs"
  alternatives, not halves of a double: A6039 lists six partner
  programs under one "Indonesian programs" container, M6041 seven
  under "Elective studies". Titles also carry trailing whitespace
  (A6011's "Master of Journalism ") and case drift versus the
  component-label strings baked from the tree ("Computer science
  component" vs "Computer Science component") — join on course codes,
  never on title strings.
- **Course curriculum → units** also exists (C2000 references 17
  units directly). We don't surface this as a flat table yet; reach
  into `courses.curriculum_structure` JSONB for it.

## Cohort scoping: single degree vs double degree

Container titles carry a second scope axis beside campus. Every
engineering specialisation splits its Part E in two — *"Students
enrolled in the single degree Engineering"* (36cp of technical
electives) and *"Students enrolled in a double degree with
Engineering"*, the latter holding 0cp and the prose "The 36 credit
points of specialisation technical electives … have already been
credited towards the double degree structure. As a result, these units
are not a requirement in the double degree." The science majors write
it one-sided instead — a *"Double degree with engineering option"*
container sitting beside a generically-titled sibling ("Level 1
mathematics sequence", "Option 1") — and D3001's PRIMARY04 splits its
**entire** structure into "Primary education single degree" and
"Primary education double degree" branches of 204cp each.

`detectDegreeShape` tags groups `single` / `double` from these titles
(inherited down the subtree, since the label sits on the branch, not
the leaves) and `fetchCourseWithAoS` keeps only the branch matching the
course the AoS was reached through. 29 of 2026's 402 AoS carry a
cohort-scoped group. Two rules matter:

- **Only a labelled branch is scoped.** An unlabelled sibling applies
  to everyone, so a double degree sees both its own branch and the
  generic alternatives — which is the honest reading of a choice.
- **A title naming both shapes is not a scope** ("… not the single
  degree"), or the group would vanish for everybody.

Without this, an engineering double degree demanded its
specialisation's full technical-elective list on top of the second
degree — 37 units for ECSYSENG04, 44 for SFTWRENG02 — which four
students reported independently.

## Cross-year references are the norm

When a requisite leaf points at `FIT1008`, its `academic_item_url`
usually looks like `/2021/units/FIT1008` — referencing the
2021-handbook version of that unit, not the current year. **~88% of
requisite refs point at historical years.** This is not a bug; Monash
freezes prereq pointers at whatever handbook version they were
approved against.

Planner logic must match on code alone. `requisite_refs` already
drops the referenced year for this reason — a student who took
`FIT1008` in 2024 satisfies a 2026 unit's prereq even when the leaf's
URL says 2021.

## Tree structures inside JSONB

When a UI reaches into a raw curriculum tree (courses, AoS), the
shape varies:

- **Unit requisites** nest as `container[].containers[].relationships[]`
  (plural `relationships`).
- **AoS curriculumStructure** nests as `container[].container[].relationship[]`
  (singular `relationship`).
- **Course curriculumStructure** mixes both, and also has AoS codes
  appearing as bare string values outside any array.

The only stable invariant is that leaves carry an
`academic_item_code` field. The ingest walker (`collectCodeRefs` in
`packages/ingest/src/parse.ts`) is deliberately shape-agnostic: it
recurses every property and treats any object bearing
`academic_item_code` as a leaf. UIs that render raw trees should do
the same rather than hard-code container keys.

Each leaf in a curriculum tree carries `academic_item_credit_points`,
`academic_item_name`, `academic_item_url`, `abbr_name`, `order`, and
`parent_connector` (`{label: "AND"|"OR", value: ...}`) — so you have
everything needed to render "6cp | FIT1045 Introduction to
programming" rows grouped by AND/OR without joining back.

## Baked curriculum columns are the only read path

`courses.requirement_groups`, `embedded_specialisations`,
`sub_course_refs` and `component_labels` are populated by ingest (and
`backfill --force`) for **every** row that has a curriculum tree; they
are NULL exactly when `curriculum_structure` is NULL (research
programs — expected). The webapp reads these columns and never walks a
course tree at request time: extraction logic runs in one place
(ingest), so a fix to the extractor plus a backfill is guaranteed to
be what users see. Areas of study are the exception — they have no
baked requirement-group column yet, so `fetchCourseWithAoS` still
extracts from `areas_of_study.curriculum_structure` per AoS.

## Fields that aren't what they look like

- `courses.description` — populated on **6/501** records. Use
  `overview` instead (94%).
- `units.exclusions` — always empty string. The "can't take both"
  relationship lives in `requisites` with `requisite_type =
  prohibition`.
- `areas_of_study.type` — always null. The study-level bucket you
  actually want is `areas_of_study.study_level` (extracted from
  `undergrad_postgrad`): "Undergraduate", "Postgraduate", "Honours",
  "Research".
- `courses.structure` — **prose, not data.** Despite the name, this
  is an HTML narrative ("This course is structured in four parts:
  Part A. Core studies…") populated for all 501 of 2026's courses,
  not the empty `{}` an earlier audit claimed. We ignore it on
  ingest — `curriculum_structure` (different spelling, different
  casing) holds the structured tree the planner actually consumes.
  Surface `structure` only as a fallback overview, never as data.
- `courses.majors_minors`, `courses.specialisations` — always empty
  arrays in 2026. The real mapping lives inside curriculum_structure;
  use `course_areas_of_study` which already extracts it.
- `courses.double_degrees` — technically populated for 60 records
  but the content is malformed HTML like `"<"`. Unusable.
- Research-program courses (Doctorate/Masters by research, 67 in
  2026) have null `curriculum_structure`. Expected, not missing.
- `requisites.description` — empty 99.9% of the time (see above).

## Curriculum credit-point math lies in specific, recurring ways

Learned while making `extractRequirementGroups` recall-complete
(2026-07). The extractor (`packages/db/src/curriculum.ts`) handles all
of these; if you write another tree consumer, don't rediscover them:

- **Intentionally over-budget Parts.** S2000 Part A lists 54cp of subs
  against a 48cp budget; the handbook's own prose says the overlap is
  expected ("a level 1 sequence is typically counted towards the
  chosen major in Part B"). You cannot conclude "over budget ⇒ data
  error" or "removing X keeps budget ⇒ X optional".
- **Zero-cp sub-containers hold real unit pools.** A2000's Part B
  domains ("complete 24 points from the following…") carry no
  credit_points. ~49 courses/year do this. Skipping cp-less subs
  silently hides half of every "…and Arts" double degree.
- **Umbrella + duplicate views.** E3001/L3001 expose a full-budget
  "Course requirements" container (often *empty prose*) NEXT TO
  per-Part containers holding the same content. Top-level part cps sum
  to 2× the course. Only unit-bearing subs should compete for budget.
- **Leaf lists share their container budget with sibling subs.**
  B2001 Part A: 42cp = 7 × 6cp listed units + a 6cp "Specified
  commerce elective" sub ⇒ the list is 6-of-7 (the ACC1100/ACC1001
  pair is a hidden pick-one), NOT all-required. Campus-scoped or
  choice-shaped siblings are alternatives — count one, not the sum.
- **Campus scoping lives only in container titles.** "Core studies -
  Malaysia", "Additional coursework studies (Clayton)", "CLAYTON: …",
  "Part E … - For the Indonesia offering only", bare "a. Malaysia".
  There is no structured campus field. Beware red herrings like
  "Accreditation in Malaysia - IMPORTANT INFORMATION". A single-campus
  course (C2004) may suffix its *real core* with "- Malaysia" — only
  suppress scoped groups when unscoped/other-scope siblings exist.
- **"Elective"-titled groups whose options sum exactly to the budget**
  (C2004 Part C: 8 × 6cp under 48cp) look mandatory to cp math but are
  open pools. Title semantics ("elective", "minor") beat arithmetic.
- **Container `description` prose states the real rule** ("You must
  complete 42 credit points, comprising 36 credit points (six units)
  from the following list; and 6 credit points…") and is the best
  ground truth for validating extraction — used by the golden fixture
  tests and `pnpm eval:curriculum`.

Hand corrections the math can't derive live in
`packages/ingest/curriculum-overrides.json` (applied by ingest,
`backfill:curriculum`, and `pnpm overrides:apply` — never in SQL
migrations, which re-ingest wipes).

## Attendance mode codes

`unit_offerings.attendance_mode` is verbose prose. Every value has a
parenthetical canonical code at the end, extracted into
`attendance_mode_code`. 28 distinct codes observed across the full
corpus (was 24 in earlier years); the six most common:

| code | example source string |
|---|---|
| `ON-CAMPUS` | "Teaching activities are on-campus (ON-CAMPUS)" |
| `EXT-CAND` | "External Candidature (EXT-CAND)" |
| `IMMERSIVE` | "Teaching mostly conducted outside of a classroom/campus environment (IMMERSIVE)" |
| `ON-BLK` | "Teaching activities are on-campus and in a block period (ON-BLK)" |
| `ONLINE` | "Teaching is all online (ONLINE)" |
| `FLEXIBLE` | "Some activities have a choice of on-campus or online teaching activities (FLEXIBLE)" |

Use `attendance_mode_code` for filtering. Use `attendance_mode` for
display if you want the full description, otherwise the code is fine
for both.

## AoS `kind` classification

`course_areas_of_study.kind` is derived by classifying every
container title on the path from root to the AoS-code leaf via
case-insensitive keyword matching, in this priority order:

| keyword | kind |
|---|---|
| `extended major` | `extended_major` |
| `specialisation` / `specialization` / `specialist` | `specialisation` |
| `minor` | `minor` |
| `elective` | `elective` |
| `major` | `major` |
| _(no match)_ | `other` |

Order matters — `extended major` is checked before plain `major`.

**Which ancestor wins:** we pick the *deepest* ancestor whose label
matches a keyword. This used to be "the nearest ancestor", but
Monash sometimes nests campus splits ("Clayton", "Malaysia") inside
discipline-named Parts ("Parts C, D and E. Engineering
specialisation…"). When that happens, the nearest ancestor is the
opaque campus name and would demote real specialisations to `other`.
The current rule prefers `specialisation` (from the Part title) over
`other` (from "Clayton"), while still letting a more-specific
disciplinary container override an outer one.

`relationship_label` stores the title that the classifier matched on
(so display can show "Parts C, D and E. Engineering specialisation"
rather than the campus name).

`course_areas_of_study.scope` carries the campus the edge sits under
(`detectScope` over the same ancestor path, deepest first) — E3001
splits its 22 engineering minors into "Malaysia offerings" and "Clayton
offerings", and 66 of 2026's 718 edges are scoped this way (33 Clayton,
18 Malaysia, 15 Caulfield and Clayton). It is read on a **separate
pass** from `kind`: the classifier deliberately looks past campus
containers so a Malaysia split nested inside "Parts C, D and E.
Engineering specialisation" still classifies as a specialisation, which
means the same walk can't produce both.

`other` rows are genuinely structural containers — honours research
streams, generic "Course requirements" buckets, or AoS references
sitting under un-keyworded prose. They are not specialisations.

## HTML content

Several text fields contain HTML:

- `units.handbook_synopsis`
- `courses.overview`
- `areas_of_study.handbook_description`
- `enrolment_rules.description`

Monash ships inline tags (`<p>`, `<br>`, `<a>`) and occasional
non-breaking spaces. Render with a trusted-HTML path (React:
`dangerouslySetInnerHTML`, or sanitise via DOMPurify first if the
content is displayed in a security-sensitive context — handbook
content is first-party so direct render is defensible). Do not try
to strip tags; some fields rely on them for line breaks.

## Corpus shape (2026, pre-reingest of A4/A7/A10 fixes)

| table | rows |
|---|---|
| `units` | 5,218 |
| `courses` | 501 |
| `areas_of_study` | 410 |
| `unit_offerings` | 10,189 |
| `requisites` | 3,310 |
| `requisite_refs` | 7,339 |
| `enrolment_rules` | 4,456 |
| `course_areas_of_study` | 719 |
| `area_of_study_units` | 6,773 |

Requisite type split: 1,612 prohibition · 1,317 prerequisite · 381 corequisite.
AoS kind split: 195 major · 162 specialisation · 113 other · 107 minor · 80 elective · 62 extended_major.

After the A10 fix, expect `other` to shrink (campus-shadowed real
specialisations move to `specialisation`).
