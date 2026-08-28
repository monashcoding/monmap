# Plan — multiple majors/minors, and the campus preference

Covers feature #2 from `feedback-triage-2026-05.md`: **multiple
majors / minors (9 requests — #15, #24, #34, #41, #50, #63, #67, #77,
#81)**, plus the unfinished **campus preference** half of B4, which is
folded in because both change the persisted state shape and doing them
together means reasoning about saved-plan compatibility once.

Written against the 2026 corpus and the code as of `818d67a`.

---

## 0. What the data says (checked, not assumed)

**Multi-option courses are a minority, and concentrated.** Courses
offering more than one option of a kind in 2026:

| kind | courses | edges | distinct AoS |
|---|---|---|---|
| specialisation | 30 | 162 | 80 |
| major | 14 | 195 | 101 |
| minor | 8 | 129 | 79 |
| other | 8 | 90 | 81 |
| elective | 6 | 80 | 42 |
| extended major | 3 | 62 | 24 |

The heavy hitters are S2000 (29 majors, 24 minors, 23 extended
majors), A2000 (29 majors), S3001/S3002 (24 majors, 22 minors each),
E3001 (22 minors), A0502 (21 majors) and B2000 (14 majors). Anything
we build is exercised by roughly a dozen courses — but they are the
biggest, most-planned degrees in the corpus.

**There is no structured cardinality anywhere.** `relationship_label`
never states how many picks are allowed: a query for count words
(`one|two|three|1|2|3|select|choose|complete`) across all 2026
`course_areas_of_study` rows returns **zero** matches. The number of
majors a student may take is not a field we can read.

**It exists only as free English prose**, in the `description` of
curriculum-tree containers, for **37 of 2026's courses**:

> B2008 — "You will complete your Bachelor of Computer Science
> specialisation and **one major** in the Bachelor of Commerce. Where
> you have space in your degree you may complete **a second major**…"

> B2020 — "You will complete **one major** from Bachelor of Commerce
> and **one major** from Bachelor of Arts."

Note the modality: a second major is *permitted where you have space*,
not mandated and not hard-capped. So the ceiling is a **budget
question, not a rule question** — which is the single most important
input to this design.

### 0.1 The rule that actually bites

Two courses state a constraint we currently model nowhere:

> A2000 — "no more than **two units (12 credit points)** can be
> credited towards two majors, or a major and a minor. **The same
> credit points cannot be credited towards more than one minor.**"

> B2042 — "No more than two units can contribute towards two majors,
> or a major and a minor, in the same course (including a double
> degree course)."

This is a double-counting cap, and `summarizeAoSProgress`
(`progress.ts:153`) is called **once per AoS, independently**, with no
cross-AoS awareness. Today that is harmless because a student holds at
most one pick per slot. The moment they hold two majors that share
units, a shared unit counts **fully toward both** while the degree
credit total counts it **once** (`summarizePlan` de-dupes via
`countedCodes`).

The visible failure: both majors race toward 100% while the credit
ring lags, and the plan claims completion Monash would reject. That is
the same class of "the tool told me I was done and I wasn't" bug the
May feedback was full of, so it must not ship as a known defect.

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
- Soft-cap at **3 per kind per component**. Not a handbook rule —
  a guard against unbounded key growth. Nothing in the corpus suggests
  a fourth simultaneous major is real.
- Only offer it for kinds where it is meaningful: `major`, `minor`,
  `extended_major`. **Not** `specialisation` — those slots are already
  split per component *and* per relationship label (Part C vs Part D),
  so a repeat there means "a second Part C specialisation", which the
  handbook never describes.
- Only when the slot actually has spare options
  (`options.length > picks`).

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
   sharing between two minors (A2000: "the same credit points cannot
   be credited towards more than one minor" — a stricter, separate
   rule).

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
  `aos.scope` (67 of 719 2026 edges carry one). This is the filtering
  half B4 left open: the chip already tells a Clayton student which
  minors are Malaysia-only, but they still scroll past all nine.
- **Requirement groups** — `RequirementGroup.scope` already exists and
  already suppresses auto-load; filtering display is the same predicate.

Campus values come from the corpus (`Clayton`, `Malaysia`,
`Caulfield and Clayton`, …) — read the distinct set rather than
hardcoding, and always offer "All campuses".

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
| Prose thresholds drift year to year | Single named constant, handbook quotes inline |

---

## 8. Open question

The two overlap rules are quoted from **A2000 and B2042 only**. Whether
"max 2 shared units" is a university-wide policy or those two courses'
local rule is not answerable from the corpus — no other 2026 course
states it. Applying it globally is the safer default (it warns rather
than blocks), but it is worth confirming with the faculty before the
wording implies more authority than we have.
