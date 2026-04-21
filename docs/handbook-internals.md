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
- **`enrolment_rules`** are program-level constraints ("must be
  enrolled in Bachelor of IT", "must have 48cp in Art, Design and
  Architecture"). They ship as HTML prose only — no structured tree —
  and they always have a populated `description`. You can't evaluate
  these programmatically without NLP; just render the HTML.

For graph-shaped queries on requisites ("what requires X?", "what
unlocks after X?"), use `requisite_refs` — it's the flat edge view of
the trees. Use `requisites.rule` only when you need AND/OR semantics
for validation ("does this student's set of completed units satisfy
this block?").

## Graph shape: what references what

- **Unit requisites only reference units** (`academic_item_type.value
  === "subject"`). Never courses. Verified across 7,354 leaf refs in
  the 2026 corpus — zero course refs.
- **AoS curriculum → units**, with a grouping label ("Core units",
  "Elective units", "Malaysia", etc.). 6,773 edges in 2026.
- **Course curriculum → AoS**, with the nearest ancestor container
  title naming the relationship ("Part B. Major studies", "Science
  extended majors", "Discipline elective studies"). 719 edges.
- **Course curriculum → units** also exists (C2000 references 17
  units directly). We don't surface this as a flat table yet; reach
  into `courses.curriculum_structure` JSONB for it.

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
- `courses.structure` — always empty `{}`. The real field is
  `curriculum_structure` (different spelling, different casing).
- `courses.majors_minors`, `courses.specialisations` — always empty
  arrays in 2026. The real mapping lives inside curriculum_structure;
  use `course_areas_of_study` which already extracts it.
- `courses.double_degrees` — technically populated for 60 records
  but the content is malformed HTML like `"<"`. Unusable.
- Research-program courses (Doctorate/Masters by research, 67 in
  2026) have null `curriculum_structure`. Expected, not missing.
- `requisites.description` — empty 99.9% of the time (see above).

## Attendance mode codes

`unit_offerings.attendance_mode` is verbose prose. Every value has a
parenthetical canonical code at the end, extracted into
`attendance_mode_code`. 24 distinct codes observed in 2026; the six
most common:

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

`course_areas_of_study.kind` is derived from `relationship_label`
(the nearest ancestor container title) via case-insensitive keyword
matching, in this order:

| keyword | kind |
|---|---|
| `extended major` | `extended_major` |
| `specialisation` / `specialization` / `specialist` | `specialisation` |
| `minor` | `minor` |
| `elective` | `elective` |
| `major` | `major` |
| _(no match)_ | `other` |

Order matters — `extended major` is checked before plain `major`.
The 113 `other` rows in 2026 are genuinely structural containers
that aren't a degree component — honours research streams, location
splits ("Malaysia offerings"), generic "Course requirements" buckets.
Not misclassifications.

The original label is kept in `relationship_label` for display
fidelity.

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

## Corpus shape (2026)

| table | rows |
|---|---|
| `units` | 5,217 |
| `courses` | 501 |
| `areas_of_study` | 410 |
| `unit_offerings` | 10,189 |
| `requisites` | 3,310 |
| `requisite_refs` | 7,341 |
| `enrolment_rules` | 4,455 |
| `course_areas_of_study` | 719 |
| `area_of_study_units` | 6,773 |

Requisite type split: 1,612 prohibition · 1,317 prerequisite · 381 corequisite.
AoS kind split: 195 major · 162 specialisation · 113 other · 107 minor · 80 elective · 62 extended_major.
