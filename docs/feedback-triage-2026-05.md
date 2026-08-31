# MonMap feedback triage — May 2026 form

Source: *MonMap Feedback Form (Responses)* — 88 responses, all
submitted 18 May 2026. Median usefulness rating 4/5.

Every claim below was checked against the current code and the live
2026 corpus rather than taken at face value: the form is three months
old and **89 commits** have landed since, so a large share of what
students reported is already gone. Response numbers (`#12`) are
zero-indexed rows of the CSV.

---

## 0. Already fixed — do not re-work

Verified against the DB / code as of 2026-08-19, and **re-verified
across all seven ingested years (2020-2026) on 2026-08-31** after the
A2000 entry below turned out to have been true of 2026 only. The
per-year column records what is actually true, not what 2026 implies.

A "missing" entity in an early year is usually Monash not having
created it yet, not a broken fix — those are marked *n/a*, and are
distinguished from cases where the fix genuinely failed to apply.

| Report | Claim | Why it's closed |
|---|---|---|
| #35 | PHS3302's tree shows no prerequisites | `requisite_refs` now carries PHS3101 + PHS3201, pulled out of `enrolment_rules` prose (2026-05-21) |
| #26, #39 | FIT1053 doesn't satisfy a FIT1045 prerequisite | **Fixed 2023-2026; genuinely unfixable 2020-2022.** The rule needed a *mutual* prohibition, but Monash records half its edges one-directionally, and the `(Advanced)` strip missed 2023's colon spelling ("Introduction to programming: Advanced"). Both fixed 2026-08-31 — equivalence is now symmetrised and the suffix strip covers `:`/`-`. 2020-2022 stay unmatched because the titles genuinely differ ("Algorithms and programming **fundamentals** in python" vs "Algorithms and programming in python (advanced)"), which no title rule can bridge |
| #7 | FIT3144 takes two slots per semester instead of 6+6 | FY credit split (2026-05-19) + `slotUsedWeight` offerings fix (2026-06-12) |
| #66, #74, #70 | Arts majors and extended majors are swapped; psychology is the only major | **Was 2026-only; fixed for all years 2026-08-31.** The classifier read "Part A. Arts listed majors and extended major" (2022-2025) as wholly extended, inverting 27-29 areas, and missed "Psychology extended  major" on a double space — so psychology really was the only major. Both fixed in `classifyAosRelationship`, backfilled all years: A2000 is now 26-31 majors / 1-2 extended everywhere |
| #40, #21 | L3014 / Master of IT can't be selected | Present 2025-2026 (L3014 is newer than 2024, so earlier years are n/a); course-picker limit raised 300 → 500 (2026-06-12) |
| #61 | ACC1001 missing | Present 2024-2026; absent 2020-2023 because the unit did not exist yet (n/a, not a defect) |
| #44, #73, #83 | MTE3103 → MTE2204, MMA units stale | MTE2204 and MMA2005 exist in 2026 only — they are new units, so earlier years are n/a rather than broken |
| #25, #53, #59, #20, #51 | Can't choose majors/minors on a double degree | Per-component AoS selection (2026-07-02) |
| #9 | A random psychology specialisation is offered | `excluded_aos` prose handling (2026-07-02) |
| #3 | F2012 has no autofill/tree | Double-degree component templates fixed (2026-06-19) |
| #18 | Unit tree empty for B2025 | Empty-tree-after-picking fix (2026-05-31) |
| #5, #12, #31, #87 (partly) | Engineering doubles offer specialisations the handbook forbids | AoS narrowing (2026-08-18): E3010 went 41 → 4 AoS; 50 of 110 doubles narrowed |

---

## 1. Open bugs

Ordered by number of independent reports.

### B1 — A failed unit can't be repeated *(5 reports: #38, #42, #43, #56, #84)* — **FIXED** (`c2ba139`)

> "inability to use the same unit twice when planning due to a failure"
> "Ability to add a unit twice, some of us failed ;-;"

**Root cause.** Three layers each assume a code appears at most once
plan-wide:

- `components/planner/unit-search-dialog.tsx:343` — `placed =
  plannedCodes.has(u.code)` is computed over the *whole plan*, and the
  Add button is `disabled={placed}` (line 563). The row also renders
  `aria-disabled` and a "Already on plan" chip.
- `lib/planner/state.ts:233` (`add_full_year_unit`) — scans every year
  and every slot, bailing if the code exists anywhere.
- `lib/planner/progress.ts:70` — a repeated code adds its credit points
  to the degree total **again**, and `summary-bar.tsx:22` renders
  repeats as a destructive error ("Each unit should appear once").

The reducer itself is already fine: `add_unit` (`state.ts:167`) only
rejects a duplicate *within the same slot*, and validation keys results
by `(year, slot, code)`, so two attempts validate independently.

**Fix.**

1. Narrow `placed` to the *target slot* rather than the plan. Keep a
   non-blocking "already in Year N S1" hint so accidental double-adds
   are still obvious.
2. `add_full_year_unit`: bail only when the code is already in the
   **target year** — an FY unit occupies S1+S2 of one year, so a retake
   in a later year is legitimate.
3. `summarizePlan`: count a repeated code's credit points **once**
   toward the degree total and `byYear`, exactly as FY twins already
   are; leave per-slot/per-kind load counting every occurrence, because
   the workload in that semester is real.
4. Reframe `duplicateUnitCodes` from an error to a neutral note:
   "Repeated units: … — counted once toward your degree total."

**Don't** touch `distribute.ts`'s already-on-plan skip: templates
should never auto-place a second copy.

**Tests.** `progress.test.ts:137` currently asserts a duplicate is
*flagged*; extend it to assert the total counts the unit once. Add a
`state.test.ts` case for the FY retake-in-a-later-year path.

### B2 — Changing the starting year appears to do nothing *(4 reports: #35, #57, #75, #85)* — **CLOSED, not reproducible**

> "Starting year button does not work."
> "I couldn't seem to change the start year on the plan page (tried 2025, 2023, 2022 and none of them worked)"
> "when trying to change the starting year back to 2025 it didnt do anything"

**CLOSED 2026-08-28 — not reproducible, no code change made.**
Confirmed working in a browser against the dev server: the picker
opens, listing every available year with the current one disabled, and
choosing one raises the confirm dialog.

Why it was reported is not fully explained, but it is *not* the code:
`handleChange` and the dialog wiring are byte-identical to the
pre-split version that predates the feedback (the 2026-05-15 superfile
split moved this code out of `plan-grid.tsx` without changing it), so
no fix of ours could have been responsible. Two environmental
explanations fit the reports and neither is actionable now: the
trigger is a small pill that is genuinely easy to miss — during
testing, three separate coordinate-clicks and a keyboard attempt all
failed to activate a menu item — and a year whose course data was not
yet ingested would clear the course and toast rather than switch,
which reads as "nothing happened".

If it resurfaces, the thing to capture is whether the *dropdown* opens
at all, which separates a hit-target problem from a dialog problem.

**Superseded — original analysis below.** Status was: root cause
unconfirmed. `components/planner/starting-year-picker.tsx`
was last modified 2026-05-15 — *three days before* the feedback — and
nothing has touched it since, so whatever they hit is still there.

The logic reads correct: `handleChange` stages `pendingYear`, the
`AlertDialog` confirms, `switchYear` (`planner-context.tsx:673`)
dispatches `set_year`, refetches the course list, the course, and the
unit data, and toasts if the course doesn't exist in the target year.

**Leading hypothesis.** The `AlertDialog` is opened from inside a
`DropdownMenuItem`. Base UI closes the menu on item click and returns
focus to the trigger; that dismissal can eat the dialog that the same
click just opened, so the user sees the menu shut and nothing else —
which is exactly what four people described. Everywhere else in the
planner (`semester-row.tsx:110`) the same `AlertDialog` is opened from
a plain button, and nobody reported that one failing.

**How to confirm** (needs a browser — do not start a second dev
server; use the one already running): open the planner, click "Change
starting year", pick a different year, and watch whether the confirm
dialog mounts at all. If it flashes and vanishes, the hypothesis holds.

**Fix if confirmed.** Defer the dialog until after the menu has closed
— either `onSelect`/`onClick` with `event.preventDefault()` on the
item, or stage the year and open the dialog in a `requestAnimationFrame`
/ the menu's `onOpenChangeComplete`. Also worth doing regardless: #35
asked for the control to be more discoverable, and it currently
collapses to a bare calendar icon under `sm`.

### B3 — Double degrees still demand the single degree's technical electives *(4 reports: #28, #31, #37, #49)*

> "It also lists technical electives that are needed but those are replaced when doing a double."
> "i require 96 credit points from Commerce side and they take up 100% of the technical elective slots + 10 units more."

**Not fixed by the 2026-08-18 AoS narrowing.** That change removed
surplus *areas of study*. This is one layer down: the electives live
inside the specialisation AoS itself (ECSYSENG04 and friends carry
E3001's Part E technical-elective groups), and `fetchCourseWithAoS`
passes an AoS's requirement groups through untouched.

Confirmed shape: `E3001.requirement_groups` holds only Part A/B
groupings ("Engineering design", "Engineering fundamentals", "First
year engineering breadth studies", "Foundational studies"); everything
specialist arrives via the AoS.

**FIXED 2026-08-19** (`e02d5e1`), and more cleanly than the sketch
below: the AoS tree states the rule itself. Every engineering
specialisation's Part E splits into "Students enrolled in the single
degree Engineering" (36cp of electives) and "Students enrolled in a
double degree with Engineering" (0cp, "these units are not a
requirement in the double degree"). `detectDegreeShape` tags
requirement groups by cohort; `fetchCourseWithAoS` keeps the matching
branch. ECSYSENG04 in E3001 keeps its 37-unit technical electives
group, the same AoS in E3010 does not. See `handbook-internals.md`,
"Cohort scoping".

~~**Fix sketch.** The parent's component prose states the real budget
("144 credit points comprising all of Part A, six credit points from
Part B, all of Part C and all of Part D") — Part E is excluded, and
`sub_course_refs[].includedParts` now records exactly that. The AoS's
own `curriculumStructure` is Part-titled ("Parts C, D and E"), so the
same `containerParts` matching used for AoS-level narrowing can drop
Part E groups from an AoS *when it is reached through a component
whose includedParts exclude E*. Requires threading the component's
`includedParts` into the per-AoS `extractRequirementGroups` call in
`fetchCourseWithAoS`, and a golden-fixture test on ECSYSENG04-in-E3010
versus ECSYSENG04-in-E3001.~~

### B4 — Campus scoping *(4 reports: #4, #16, #55, #87)* — **PARTLY FIXED**

> "Ability to choose a campus, so malaysia units don't appear in the list maybe?"
> "the engineering minors dont show Malaysia minors"
> "its telling me i need to take some units in malaysia"

There is **no structured campus field** anywhere in the corpus — scope
lives only in container titles ("Core studies - Malaysia", "CLAYTON:
…"), which `extractRequirementGroups` already detects into
`RequirementGroup.scope` and uses to suppress auto-load. Two separate
asks sit under this heading:

- **Plan-level campus preference** (feature): persist a campus on
  `PlannerState`, then filter scoped requirement groups and the unit
  search to it. Needs a new state field + migration of saved plans.
- **Malaysia minors missing** (bug) — **investigated, not what was
  reported.** All 9 Malaysia minors *are* extracted (DCBNZMNR01,
  ELCVLTMR01, FMOSYMNR01, INTMFMNR01, IOTMNR01, SEMICDMR01,
  SNSYSMNR01, SUENTMNR01, plus AIENGMNR03 shared with Clayton); several
  carry `01` version suffixes, i.e. they were added to the handbook
  after the May feedback. The real defect was that **the campus split
  was invisible**: every minor landed with
  `relationship_label = "Engineering minors"`, so a Clayton student
  browsed nine Malaysia-only options that looked identical to theirs.
  **FIXED 2026-08-21**: `course_areas_of_study.scope` (migration 0011)
  captures the campus from the ancestor path at ingest, and the AoS
  picker shows it as a chip. 66 of 2026's 718 edges are scoped.
  The *filtering* half — hiding other-campus options outright — still
  needs the plan-level campus preference above.

### B5 — "Core" tagging looks arbitrary *(3 reports: #33, #83, #9)* — **FIXED**

> "ENG1014 (definitely a core unit) is not labeled as core, but ECE5882 (a 5th year elective) is"
> "core unit tags were getting applied to units seemingly at random, couldn't pin down the logic"

The tag is derived from requirement-group membership, and
`extractRequirementGroups` is explicitly recall-first: any subtree
holding subject leaves emits a group, including uncertain ones. ECE5882
arriving as "core" and ENG1014 not is the signature of an *umbrella*
container (E3001 exposes a full-budget "Course requirements" container
next to per-Part containers — documented in `handbook-internals.md`).

**FIXED 2026-08-19.** Root cause confirmed: `unitIsCore` meant two
loose things at once. *Any* course-level group counted, so E3001's
"First year engineering breadth studies" — a 1-of-21 choice — badged 21
units; and any AoS group whose title merely *contained* "core"
counted, so ECSYSENG04's "Core List B" (pick 1 of 22, and where
ECE5882 lives) and "Materials engineering core elective" did too.
Meanwhile auto-load used the strict `autoLoad` rule, so the badge and
the template openly disagreed.

Both now call one shared predicate, `groupIsMandatory` — the badge
means exactly "auto-fill would place this". Areas of study also count
only once picked: a unit that is core in a major the student didn't
choose isn't core for them. Verified against the live corpus for every
unit students named: ECE5882 loses the badge, ENG1014 keeps it, and
ENG2005/MMA2005 *gain* it for mechatronics — which is what #83 asked
for.

Known limitation: ENG1090 and PHS1001 stay core via E3001's
"Foundational studies", which is conditional prose ("If you have not
completed VCE Physics…"). The extractor can't evaluate that, and the
badge is at least consistent with what auto-load places.

### B6 — Law/Commerce can never reach 100% *(2 reports: #69, #80)* — **FIXED**

> "webpage states to pick 6 out of 7 of the units, however with laws/commerce 2 of the 7 units … cannot be completed"
> "BTC1100 is a pre-req for commerce but is prohibited by LAW2102 Contract B"

**FIXED 2026-08-28**, and the override wasn't needed — the prohibition
edges already say it. B2001's Part A is the documented "6 of these 7";
inside L3005 the law half makes LAW2102 compulsory and `BTC1110`
prohibits it, so six was never reachable. L3005's own prose says
nothing about this, so the only evidence is the unit-level edge.

`fetchCourseWithAoS` now ships a `conflicts` map (prohibition edges
among the course's own options, symmetrised — `BTC1110` names LAW2102
but not the reverse, and half the corpus's edges are one-directional),
and both progress paths cap a group's target at what the student can
still reach. Verified on the real payload: with LAW2102 and the four
remaining cores placed, Part A goes from **5/6 = 83%** to **5/5 =
100%**, while a standalone B2001 plan is untouched at 6.

The cap only ever lowers the target, and only in response to units
actually on the plan — so it also resolves the ACC1100/ACC1001
pick-one pair for free, with no pick-one detection anywhere.

### B7 — Singles

| Report | Bug | Note |
|---|---|---|
| #17 | ATS2146/ATS3146 prohibition fires one way only | **FIXED 2026-08-29.** Confirmed: `ATS2146` names `ATS3146`, not the reverse, and 1,557 of 2026's 3,041 prohibition edges are one-directional. Validation only ever evaluated a unit's *own* rule, so the conflict lit up on one card and not the other. `validatePlan` now builds a reverse index — planned units whose rules name this one — and merges both directions into a single error per card, so a mutual pair isn't reported twice. |
| #54 | Unit detail pulls the *start* year's handbook, not the current one | **Working as designed, no change.** `use-unit-data-hydration.ts` deliberately fetches year-N data from handbook `courseYear + N`, because validating a 2028 slot against 2026 requisites would be wrong. The detail popover already offers an opt-in year switcher that fetches a one-off snapshot, which covers the "what does it look like now?" case. |
| #57 | Tree shows FIT9xxx postgrad + other-faculty units | Not a single — this is tree scoping, a feature. The tree is course-agnostic by design; limiting it to units reachable from the plan's course is real work with its own UX questions. |
| #58 | "WAM - units in my course too" | **Needs clarification, not actionable.** The WAM already counts only units on the plan that have a mark entered (`wam-context.tsx`), so it can't be pulling in units from outside the course. The report is one line and reads equally as "include my course units too" or "it's including things it shouldn't". Worth asking the reporter before guessing. |
| #49 | ENG4099 required but unaddable, replaced by 480X | **Resolved by data refresh.** `ENG4099` is gone from 2026 (replaced by ENG4801–4804 "Professional practice") and appears in no requirement group, AoS unit list, or curriculum tree. |
| #82 | AEH2001/2002/3001 marked as not running in S2 | **Resolved for the years they run.** In 2020 and 2025 these units genuinely have no S2 offering (First semester / Winter / Summer only), so the planner is right to say so — verified across all years 2026-08-31. Otherwise: All three carry two S2 offerings ("Second semester (Northern)", "(extended)"), and `classifyTeachingPeriod` prefix-matches those to S2, so the planner reads them correctly. |
| #63 | Adding a 5th unit / a semester is hard to find | UX: inline "+" affordance instead of the capacity control ported from MonPlan. |
| #77 | July (mid-year) intake can't be represented | Plan starts at S1; needs a start-semester option. |
| #60 | Unit search is laggy | Server action per keystroke, debounced; consider client-side prefilter. |

---

## 2. Feature requests, by demand

1. ~~**Prior credit / advanced standing / exemptions — 11 requests**~~
   (#0, #1, #14, #23, #36, #39, #45, #47, #53, #65, #86) —
   **SHIPPED 2026-08-28.** `PlannerState.credit` holds two flavours in
   one shape: *specified* credit naming a unit (satisfies prerequisites,
   ticks off requirement groups, counts as a literal enrolment for
   prohibitions, expands through equivalents so credit for FIT1053
   satisfies a prereq naming FIT1045) and *block* credit with no code,
   which moves the credit-point total only.

   Not modelled as the pseudo-year the sketch proposed: a credited unit
   has no teaching period, campus or offering, so a slot means inventing
   all three and then suppressing the validation they'd trigger — which
   is exactly the hand-rolled workaround students described. The field
   is optional, so plans saved before it existed stay valid with no
   migration.
2. **Multiple majors / minors — 9** (#15, #24, #34, #41, #50, #63, #67,
   #77, #81). Per-component AoS selection already exists; this asks for
   *n* picks per component rather than one.
3. **Notes on units and semesters — 3** (#4, #70, #78).
4. **WAM/GPA projection — 3** (#10, #35, #58), incl. per-assignment
   grade modelling (#10).
5. **Export / import — 3** (#18 transcript or WES import, #60 image
   export, #85 Excel round-trip).
6. **Add units straight from the requirements sidebar — 3** (#52, #76,
   #83).
7. **Elective planning aids — 3** (#2, #29, #44): saved candidates,
   recommendations, "fill my map from these electives".
8. Course cost calculator (#29), unit reviews (#2, #55), exchange
   semesters (#55, #62), demo video (#8), course-map link (#60),
   colour customisation (#30, #37).

---

## 3. Suggested order

1. ~~**B1**~~ — done, `c2ba139`.
2. ~~**B3**~~ — done, `e02d5e1`.
3. ~~**B5**~~ — done.
4. ~~**B2**~~ — closed, not reproducible.
5. ~~**Prior credit**~~ — done.
6. ~~**B4**~~ display half done; the campus *preference* remains.
7. ~~**B6**~~ — done.
8. ~~The B7 singles~~ — swept 2026-08-29: #17 fixed; #49 and #82
   resolved by data refresh; #54 working as designed; #58 needs the
   reporter; #57, #63 and #77 are features, not singles.
