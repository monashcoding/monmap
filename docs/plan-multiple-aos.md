# Plan — multiple majors/minors, and the campus preference

Covers feature #2 from `feedback-triage-2026-05.md`: **multiple
majors / minors (9 requests — #15, #24, #34, #41, #50, #63, #67, #77,
#81)**, plus the unfinished **campus preference** half of B4, which is
folded in because both change the persisted state shape and doing them
together means reasoning about saved-plan compatibility once.

Written against **all seven ingested handbook years (2020–2026)** and
the code as of `818d67a`.

---

## 0. What the data says (checked, not assumed)

Checked across **all seven ingested years (2020–2026)**, not just the
current one — the planner lets students switch handbook year, so
anything built here runs against every year in the corpus.

### 0.1 The corpus changed shape in 2022–23

| year | AoS edges | courses with >1 major | >1 minor | >1 specialisation | largest single slot |
|---|---|---|---|---|---|
| 2020 | 2,112 | **50** | **21** | 35 | **60** (S2006 minor) |
| 2021 | 1,635 | 42 | 11 | 36 | 49 (S2006 major) |
| 2022 | 1,068 | 23 | 10 | 29 | 49 (S2006 major) |
| 2023 | 648 | 14 | 4 | 29 | 29 (A2000 ext. major) |
| 2024 | 658 | 13 | 4 | 29 | 29 (A2000 ext. major) |
| 2025 | 667 | 13 | 7 | 28 | 29 (A2000 ext. major) |
| 2026 | 718 | 14 | 8 | 30 | 29 (S2000 major) |

Two consequences the 2026-only view missed:

- **The audience is much larger in the early years.** 50 courses offer
  multiple majors in 2020 versus 14 in 2026, and 21 offer multiple
  minors versus 8. Describing this feature as "roughly a dozen courses"
  is true of 2026 and wrong for the corpus.
- **A slot can carry 60 options** (S2006's 2020 minors), not the 29 the
  current years top out at. Anything quadratic in options-per-slot, or
  any UI that assumes a short list, has to survive double that.

Whether the drop from 2,112 to ~650 edges is a genuine Monash
restructure or an artefact of how older years were ingested is **not
answerable from the corpus** and is worth knowing before trusting
early-year plans generally. It does not block this work: the numbers
above are the ones the planner will actually render.

### 0.2 There is still no structured cardinality — in any year

`relationship_label` never states how many picks are allowed. Across
all seven years the only match for count words is **D0501 in 2025**
(7 rows), and it is a false positive:

> "b.  One level-one unit from one of the following majors"

That is a *unit* count inside a major, not a count of majors. So the
finding holds corpus-wide: **the number of majors a student may take is
not a field we can read.**

It exists only as free English in curriculum-tree `description` prose,
in 18–42 courses per year (37 in 2026):

> B2008 — "…and **one major** in the Bachelor of Commerce. Where you
> have space in your degree you may complete **a second major**…"

Note the modality: a second major is *permitted where you have space*,
not mandated and not hard-capped. The ceiling is a **budget question,
not a rule question** — the most important input to this design.

### 0.3 The double-counting rule is broad and stable

Two courses' worth of prose looked like a local quirk at 2026-only
scope. Across years it is neither:

| years | courses stating it |
|---|---|
| 2020–2022 | 11 per year |
| 2023–2026 | **27, 28, 27, 28** |

(Counted with a tight pattern requiring both "no more than two units"
*and* a majors clause. A looser pattern also catches "no more than two
units **at first year level**", a level rule that has nothing to do
with double counting — 2–9 courses a year.)

It steps up sharply at 2023 and then holds, spanning Business, Arts and
Science (A2000, B2000-series, C2000, S2000, S3002). Wording is
near-identical, 19 of 2026's 28 sharing one phrasing:

> "…you may complete a second major with **no more than two units
> contributing towards both of your chosen majors**…"

> B2042 — "**No more than two units can contribute towards two
> majors, or a major and a minor**, in the same course (including a
> double degree course)."

A second, stricter rule appears only from 2023 and only in a handful
(4 courses 2023–2025, 6 in 2026):

> A2000 — "The same credit points cannot be credited towards more
> than one minor."

### 0.4 Why this is the part that needs care

`summarizeAoSProgress` (`progress.ts:153`) is called **once per AoS,
independently**, with no cross-AoS awareness. Today that is harmless —
a student holds at most one pick per slot. The moment they hold two
majors that share units, a shared unit counts **fully toward both**
while the degree credit total counts it **once** (`summarizePlan`
de-dupes via `countedCodes`).

The visible failure: both majors race toward 100% while the credit ring
lags, and the plan claims a completion Monash would reject. That is the
same class of "the tool told me I was done and I wasn't" bug the May
feedback was full of, so it must not ship as a known defect.

---

## 1. Storage: mint more slot keys, don't change the type

`PlannerState.selectedAos` is `Record<string, string | undefined>` —
one code per slot key. Two ways to hold *n*:

**(a) Widen the value** to `string | string[]`. Touches the Drizzle
`$type<PlannerState>()` column, every read site, and needs
normalisation on load so old plans still parse.

**(b) Mint additional keys** — `major@S2000` plus `major@S2000#2` —
leaving the type, the column and the reducer exactly as they are.

**Take (b).** It is strictly less invasive and it fits a convention
the file already documents: slot keys come in generations and *"both
stay readable forever so saved plans never migrate"*. A `#2` suffix is
a third generation of the same idea.

The payoff is large because of how `pickedAosEntries`
(`aos-slots.ts:265`) is written. It iterates `computeAosSlots` first,
then sweeps **any remaining `selectedAos` key** that names a real
course AoS, de-duplicating by code. So repeat-slot picks flow into the
requirements panel, `unit-card`'s core badge and `aos-templates`
**with no change to any of them**. The blast radius collapses to:

- `aos-slots.ts` — emit repeat slots, resolve them
- `aos-picker.tsx` — render the "add another" affordance
- progress — the overlap problem in §3

`set_aos` needs no change at all: `role` is already an opaque string.

### 1.1 Key format

`"<kind>@<scope>#<n>"` for scoped slots, `"<kind>#<n>"` for fixed
roles, `n ≥ 2`. Base key keeps its current spelling, so **every plan
saved today keeps its primary pick with zero migration** — the #2 slot
is simply absent, which already reads as "unset".

Do **not** reuse the historical `specialisation2` key for a second
major-style pick. It means something specific (C2001's Part D studio
picker inside S2004) and `KIND_LEGACY_KEYS` maps it; overloading it
would make a Part D pick resurface as a second specialisation.

---

## 2. How many picks to offer

Since cardinality isn't structured and the prose says "where you have
space", **don't parse the prose**. Twelve of the 37 matches came back
mangled through a naive regex during research, and a wrong hard cap is
worse than no cap: it blocks a legitimate plan outright.

Offer instead:

- Render the base slot exactly as today.
- Once it is filled, render an **"Add another major"** affordance
  beneath it, per kind, per component.
- Cap at **2 per kind per component**, which is what the handbook
  describes. "second major" or "double major" appears in 9-29 courses
  in every year; **"third major" and "three majors" appear nowhere, in
  any year**. A2000 states the mechanism: "You may use your Arts
  electives in Part B. and C. to complete a double major" — one major
  in Part A, a second funded from elective space. Three majors would
  also consume 144 of a 144-point degree, leaving nothing for the rest
  of the course.

  (This was initially 3, picked as a guard against unbounded key growth
  rather than from evidence. Surfacing three major slots on A2000 is
  what showed the guess was wrong.)
- Only offer it for kinds where it is meaningful: `major`, `minor`,
  `extended_major`. **Not** `specialisation` — those slots are already
  split per component *and* per relationship label (Part C vs Part D),
  so a repeat there means "a second Part C specialisation", which the
  handbook never describes.
- Only when the slot actually has spare options
  (`options.length > picks`).

Sibling exclusion must be a set membership test, not a nested scan:
2020's S2006 minor slot carries **60 options**, and three sibling
slots over 60 options is where a naive O(n²) filter starts to show.

A repeat slot must exclude codes already picked in a sibling slot of
the same kind, or a student can pick the same major twice.

---

## 3. The overlap problem — the part that needs real thought

This is the substance of the work; §1 and §2 are plumbing.

**Do not** silently subtract shared units from one AoS. Which major
"loses" the unit is arbitrary, and the student sees progress move
backwards on an AoS they didn't touch.

**Do** compute overlap and surface it:

1. After resolving picks, intersect the option sets of every pair of
   picked AoS.
2. For each pair sharing ≥1 **placed** unit, report the shared codes.
3. Show a note on the requirements panel: *"ECC2000 and ECC1000 count
   toward both Economics and Finance. Monash allows at most 2 units
   (12 cp) to be shared between two majors."*
4. Escalate to a warning past 2 shared placed units, and for **any**
   sharing between two minors (the stricter, separate rule — see
   §0.3).

Apply the shared-unit note **corpus-wide, in every year**. The rule is
stated by 27–28 courses a year from 2023 and 11 a year before that
(§0.3), and its absence from a given course's prose is far more likely
to be Monash not repeating boilerplate than a deliberate exemption. A
note that warns rather than blocks is safe under that uncertainty.

The two-minor rule is different: it appears only from **2023**, in 4–6
courses. Gate that one on the course actually stating it, or it will
fire on 2020–2022 plans against a rule that did not yet exist.

Keep `summarizeAoSProgress` per-AoS and honest about listed
membership. Overlap is a **plan-level** concern and belongs beside the
other plan-level validation, not inside a function whose contract is
one AoS.

Thresholds live in one named constant with the A2000/B2042 quotes
above it, since they're handbook prose we can't re-derive from data.

---

## 4. Campus preference (B4's remaining half)

Additive and optional, exactly like `credit`:

```ts
/** Campus the student is planning at; filters scoped options. */
campus?: string
```

Absent = "show everything", which is today's behaviour, so **no
migration and no change for existing plans**.

Two consumers:

- **AoS options** — filter `computeAosSlots` options by
  `aos.scope` (58–71 edges carry one in every year, 66 of 718 in
  2026 — the coverage is remarkably stable). This is the filtering
  half B4 left open: the chip already tells a Clayton student which
  minors are Malaysia-only, but they still scroll past all nine.
- **Requirement groups** — `RequirementGroup.scope` already exists and
  already suppresses auto-load; filtering display is the same predicate.

Campus values are a **closed set of exactly three across all seven
years** — `Clayton` (213 edges), `Caulfield and Clayton` (131) and
`Malaysia` (109). Still read the distinct set rather than hardcoding,
so a new campus appears on its own, but the picker can be a plain
select rather than a search: it will never be long. Always offer "All
campuses".

Scoped-out picks must **not** be deleted from `selectedAos`. A student
who sets campus after picking should see a "this pick is Malaysia-only"
note, not a silently emptied dropdown.

---

## 5. Phasing

Each phase ships independently and leaves the app correct.

| # | Phase | Why this order |
|---|---|---|
| 1 | `campus` field + option/group filtering | Smallest, self-contained, proves the additive-optional pattern again, closes B4 |
| 2 | Repeat slot keys in `aos-slots.ts` + resolution + tests | Pure logic, no UI, fully unit-testable |
| 3 | Overlap detection + panel surfacing | The correctness guard — **must land before or with phase 4** |
| 4 | "Add another" picker affordance | Turns it on for users |

Phase 3 before phase 4 is the point. Shipping the picker first would
put double-counted progress in front of students, which is precisely
the failure mode the feedback complained about.

---

## 6. Tests

- `aos-slots.test.ts` — repeat keys mint/resolve; base key unchanged
  for a single pick (**regression guard on saved plans**); sibling
  exclusion; specialisation slots never repeat; soft cap.
- New overlap tests — disjoint majors report nothing; 2 shared placed
  units note; 3 warn; any two-minor sharing warns; unplaced shared
  options don't trigger (membership isn't double-counting).
- `progress.test.ts` — `summarizeAoSProgress` per-AoS numbers are
  **unchanged** by the presence of a second pick.
- Campus — scoped options filter; unscoped always show; a pick that
  falls out of scope survives in state.
- **Cross-year** — fixture a 2020 course with a 60-option slot (S2006
  minor) so the picker and sibling exclusion are exercised at twice the
  current years' width, and assert the two-minor rule stays silent on a
  2020 plan (§0.3: it doesn't exist before 2023).
- Year switching needs no new handling — `set_year` already resets
  `selectedAos` wholesale (`state.ts:153`), so repeat keys clear with
  everything else. Worth a test pinning that, since only 113 of 2026's
  393 AoS codes exist in 2020 and a surviving pick would usually be
  invalid.
- `pnpm --filter webapp verify:resolver` — snapshot must not drift;
  none of this touches the resolver, so any drift is a bug.

Run tests with `node --experimental-strip-types --test` (plain
`pnpm test` fails on Node 22.13).

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| Double-counted progress overstates completion | Phase 3 before phase 4; overlap surfaced, never silently netted |
| Key proliferation in saved plans | Soft cap; `pickedAosEntries` already tolerates unknown keys |
| A hard cap blocks a legitimate plan | No parsed cap; student-driven with a soft ceiling |
| Campus filter hides a pick a student already made | Filter options, never delete state; annotate out-of-scope picks |
| Prose thresholds drift year to year | Single named constant, handbook quotes inline; the two-minor rule is gated on the course stating it, since it postdates 2022 |
| Early years are wider than current ones (60-option slots, 50 multi-major courses in 2020) | Set-based sibling exclusion; fixture the widest real slot rather than a current-year one |

---

## 8. Open questions

**Mostly resolved.** The shared-unit rule is not a two-course quirk:
27–28 courses state it every year from 2023, 11 a year before that,
across three faculties and in near-identical wording (§0.3). Applying
the note corpus-wide is well founded. What remains unconfirmed is
whether courses *silent* on it are exempt or merely not repeating
boilerplate — which is why it warns rather than blocks.

**Still genuinely open:** the corpus drops from 2,112 AoS edges in 2020
to ~650 from 2023 (§0.1). If that is an ingest artefact rather than a
Monash restructure, early-year plans are built on partial data and this
feature would be the most visible place that shows — 2020 is exactly
where multi-major courses are most common. Worth answering before
promoting year switching, though it does not block this work.
