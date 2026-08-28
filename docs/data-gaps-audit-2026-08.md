# Data & edge-case audit — all years (2020–2026)

Ran against the live corpus on 2026-08-29, checking every ingested
handbook year rather than just the current one. Each item below was
measured, not inferred; where a headline number overstates the real
severity, the narrowing check is shown too.

Ordered by **what a student actually hits**, not by row count.

---

## 1. Confirmed bugs — small, bounded, fixable

### 1.1 Whitespace-padded requisite codes *(6 years, 100% recoverable)*

`requisite_refs.requires_unit_code` sometimes carries leading/trailing
spaces or tabs — `"ETW2001 "`, `" AMU1312"`, `"BFF5525\t\t"`. They
never match a unit row, so the prerequisite reads as permanently
unsatisfiable.

| year | padded refs | would resolve after `btrim` |
|---|---|---|
| 2021 | 14 | 11 |
| 2022 | 15 | 9 |
| 2023 | 13 | **13** |
| 2024 | 9 | 9 |
| 2025 | 13 | 11 |
| 2026 | 13 | **13 (all)** |

**Every padded 2026 ref resolves once trimmed.** This is a pure ingest
defect with a one-line fix in the parser plus a backfill.

Encouragingly it is *isolated*: `units.code`,
`area_of_study_units.unit_code`, `course_areas_of_study` and the
owning `requisite_refs.unit_code` are all clean (0 padded rows), so
only the requisite *target* side needs the trim.

### 1.2 Six diplomas render a completely empty planner

`U0601`–`U0606` (Diplomas of Arts, Art & Design, Business,
Engineering, IT, Science) have **no requirement groups, no areas of
study and no component courses**. Picking one gives a blank grid with
nothing to load.

Present in **2024, 2025 and 2026**; absent before (2021–2023 had zero
such courses, 2020 had two different ones — B2027, M2015). These are
Monash College diplomas, so they may genuinely lack a handbook
structure — worth confirming before treating it as an extractor bug.

### 1.3 Six areas of study are offered but contain no units

Selectable from a 2026 course, then empty:

`BUSADMST01` (Business administration studies, major),
`BUSCOMST01` (Business and commerce studies, major),
`BUSSTDES01` (Business studies, specialisation),
`BUSSTUDS01` (Business studies, major),
`ECBUSSTR02` (Economics and business strategy, minor),
`ECONOMIC02` (Economics — appears as both minor and elective).

Down sharply from 41 such AoS in 2025 to 14 in 2026 overall, so
something already improved here; these six are the residue that is
still reachable from a course.

### 1.4 Three 2026 double degrees have no component templates

`M3007` (Nursing + Midwifery), `F2020` (Design + Fine Art), `E3002`
(Engineering + Arts) carry no `sub_course_refs`, so neither half
produces a template — the failure mode #3 reported in the May
feedback for F2012.

### 1.5 Two template units have no satisfiable prerequisite

`MTE4592` and `MTE4598` are listed in a 2026 area of study, and
*every* prerequisite code they name is absent from 2026. A student
told to take them cannot clear the error by any means.

### 1.6 Two courses have null credit points

`B2057` (Bachelor of Digital Business) and `B0601` (Diploma of
Business). `summarizePlan` does `course?.creditPoints ?? 144`
(`progress.ts:117`), so the ring silently adopts a **144-point
denominator** that was never checked against these courses. No crash —
`right-sidebar.tsx:223` guards `> 0` — but the percentage may simply
be wrong. The other 67 null-CP courses in 2026 are research doctorates
and masters, which nobody plans in this tool.

---

## 2. Structural gaps — by design, but students hit them

### 2.1 586 units cannot be placed in any slot the UI renders

The planner models S1, S2, Summer A/B, Winter and Full Year.
`classifyTeachingPeriod` collapses everything else to `OTHER`, and
`OTHER` is in neither `PRIMARY_SLOT_KINDS` nor
`OPTIONAL_SLOT_KINDS` — **there is no slot a student can put them
in.**

2026 offerings living outside the modelled grid include research
quarters 1–4 (2,955 offerings), teaching periods 1–6, terms 1–4,
trimesters 1–3 and Monash Indonesia terms 1–2.

| year | units offered *only* in unmodelled periods |
|---|---|
| 2020 | 324 |
| 2023 | 573 |
| 2025 | 594 |
| 2026 | 586 |

**76 of the 2026 ones appear in an area-of-study unit list** — i.e.
a template tells the student to take a unit the grid cannot hold
(AHT2130, ATS2275, APG5103, …). That is the sharp end of this gap and
the part worth fixing; the other ~510 are mostly postgraduate research
units nobody is mapping.

### 2.2 "Second semester to First semester" is classified as S2

78 offerings across 72 units in 2026. The prefix match on
`"second semester"` catches it, so it lands in S2 — but it is a
*cross-year span* (S2 running into the following S1), structurally
closer to a full-year unit. Placing it in S2 alone understates its
footprint.

### 2.3 Cross-year requisite references are normal, and mostly benign

1,215 of 2026's 8,288 requisite refs (14.7%) name a unit absent that
year, and the count climbs steadily (154 in 2020 → 1,215 in 2026).

This looks alarming and mostly isn't: **141 of the 159 missing
prerequisite codes exist in another year**, i.e. they are discontinued
units the handbook still names, exactly as `handbook-internals.md`
documents. And while 300 units have ≥1 dangling prereq code, only the
**2** in §1.5 have *no* satisfiable code — the rest carry OR branches
that remain satisfiable.

The residual issue is wording, not logic: the error names a unit that
does not exist in the student's year, with no hint that it is
discontinued.

### 2.4 642 units have no offerings at all

12% of 2026 units are never offered anywhere (down from 992 in 2020).
They are searchable and placeable but will always warn as not offered.

---

## 3. Early years are materially degraded

This matters because the planner exposes year switching, and the
multi-major work is aimed squarely at the years that are worst.

| check | 2020 | 2022 | 2024 | 2026 |
|---|---|---|---|---|
| UG doubles with **no** component templates | **47 / 64** | 14 / 69 | 2 / 71 | 3 / 84 |
| duplicate (course, AoS) edges | 20 | — | 8 | **0** |
| AoS edges total | 2,112 | 1,068 | 658 | 718 |

**73% of 2020's double degrees have no component templates.** Anyone
switching to 2020 to plan a double degree gets half a degree or less.
Duplicate edges tell the same story from the other side — they have
been cleaned up over time and 2026 is clean.

The AoS edge count dropping from 2,112 to ~650 remains unexplained
(raised in `plan-multiple-aos.md` §8). The double-degree numbers
suggest **the early years are differently — probably more crudely —
extracted**, rather than Monash having restructured, but that is a
hypothesis and not yet evidence.

---

## 4. Verified healthy

Worth recording so these aren't re-audited:

- **0** dangling `area_of_study_units` codes in *any* year (all 6,284–6,773 rows resolve)
- **0** course→AoS edges pointing at a missing `areas_of_study` row, any year
- **0** dangling `sub_course_refs` component codes in 2026
- **0** units with null credit points, any year
- **0** padded codes outside the requisite-target column (§1.1)
- Prohibition asymmetry holds steady at ~50% every year (804/1,964 in
  2020 → 1,557/3,041 in 2026), so the symmetrisation shipped in PR #40
  generalises across the corpus rather than fitting 2026

---

## 5. Suggested order

| | item | why |
|---|---|---|
| 1 | §1.1 whitespace trim | One-line parser fix, backfill, fully recoverable, removes real false errors |
| 2 | §1.3 + §1.4 + §1.5 | Small named sets; each is a student staring at an empty or impossible panel |
| 3 | §1.6 null course CP | Cheap; stop defaulting silently — either resolve the real total or show "unknown" |
| 4 | §2.1 unplaceable units | Needs a design call (an "Other period" slot?), scoped to the 76 that templates name |
| 5 | §3 early-year degradation | Decide whether to fix extraction or hide/flag pre-2023 years |
| 6 | §2.3 wording | Say "discontinued in 2026" instead of naming a phantom unit |

§1.2 and §3 need a human judgement call before code: whether College
diplomas legitimately have no structure, and whether early years are
worth repairing or should carry a health warning.
