/**
 * Walk a course or AoS `curriculumStructure` JSONB and return the
 * structured set of requirement groups: for each grouping, the full
 * list of unit options the handbook lists, plus how many of them
 * students actually have to complete.
 *
 * No hardcoded titles or unit codes — everything is derived from
 * credit-point math, split along two error-cost profiles:
 *
 * - **Recall-first group emission**: any subtree holding subject
 *   leaves produces groups, even when the budget math can't prove
 *   what's mandatory (intentionally over-budget Parts like S2000
 *   Part A, zero-cp unit pools like A2000's Professional Futures
 *   domains). Those paths are walked as *uncertain*.
 * - **Precision-first `autoLoad`**: only groups on a *certain* path
 *   whose budget covers every option — and which aren't a
 *   campus-scoped variant — are flagged for the auto-populate
 *   template. A wrong force-loaded unit is worse than a missing one;
 *   an invisible requirement is worse than a choice chip.
 *
 * Mechanics:
 *
 *   1. **Sub-container descent**: a sub is *provably mandatory* when
 *      removing it would put the parent under budget; anything else
 *      (over-budget slack, zero-cp pools with subject leaves) is
 *      walked with `certain = false`.
 *
 *   2. **Pick-one-of-N containers** (e.g. S2000's Level 1 science
 *      sequences, 8 × 12cp under a 24cp budget) collapse into a
 *      single choice group over the union of their subject leaves.
 *
 *   3. **Leaf-level choice** ("FIT1049 OR FIT1055"): for each leaf
 *      group, budget accumulation over ordered leaves decides
 *      `required`, so "container=6, two leaves at 6cp each" reads as
 *      1-of-2. Options keep handbook `order`.
 */
export interface RequirementGroup {
  /** Container title (nearest non-empty title in the path). */
  grouping: string
  /** How many of `options` students must complete. 1 ≤ required ≤ options.length. */
  required: number
  /** All unit codes listed under this grouping, in handbook order. */
  options: string[]
  /**
   * Precision-first auto-load signal: true only when the credit-point
   * math *proves* every option mandatory AND the group is not a
   * campus/offering-scoped variant. Absent on rows baked before this
   * field existed — consumers must fall back to the legacy
   * `required === options.length` rule (see `pickDefaultUnits`).
   */
  autoLoad?: boolean
  /**
   * Campus/offering scope detected from container titles (e.g.
   * "Malaysia", "Clayton", "Indonesia"). Scoped groups stay visible in
   * the requirements browser but are excluded from auto-load whenever
   * the course also has unscoped or differently-scoped groups.
   */
  scope?: string
}

/**
 * Uncertain zero-cp unit pools ("complete 24 points from the following
 * domains") have no computable `required`; cap the display count at 1
 * so a 33-option elective pool doesn't render as "0/33 required".
 * Cosmetic only — these groups never auto-load regardless.
 */
const UNCERTAIN_POOL_REQUIRED_CAP = 1

export function extractRequirementGroups(
  structure: unknown,
  /**
   * Total course/AoS credit points, used as the root budget when the
   * structure's root node carries none (it almost never does). Without
   * it, top-level alternative streams are all treated as mandatory.
   */
  totalCp = 0
): RequirementGroup[] {
  interface AccGroup {
    grouping: string
    required: number
    options: string[]
    /** All emissions into this group were on budget-proven paths. */
    certain: boolean
    scope: string | null
    /** Depth-1 Part title, used to disambiguate colliding titles. */
    partTitle: string | null
  }
  const groups: AccGroup[] = []
  // De-dup by (depth-1 part, title) — the same title under two
  // different Parts is two different requirements (28 courses in the
  // 2026 corpus collide on bare titles).
  const indexByKey = new Map<string, number>()

  const addGroup = (
    grouping: string,
    options: string[],
    required: number,
    certain: boolean,
    scope: string | null,
    partTitle: string | null
  ) => {
    if (options.length === 0) return
    const key = `${partTitle ?? ""}\u0000${grouping}`
    const existing = indexByKey.get(key)
    if (existing !== undefined) {
      // Merge: union options preserving order, take max required.
      const cur = groups[existing]!
      const seen = new Set(cur.options)
      for (const c of options)
        if (!seen.has(c)) {
          cur.options.push(c)
          seen.add(c)
        }
      cur.required = Math.min(
        cur.options.length,
        Math.max(cur.required, required)
      )
      // OR, not AND: several courses expose the same content twice — a
      // full-budget "Course requirements" umbrella plus per-Part views
      // (E3001, L3001). A group proven mandatory via ANY path is proven.
      cur.certain = cur.certain || certain
      cur.scope = cur.scope ?? scope
      return
    }
    indexByKey.set(key, groups.length)
    groups.push({
      grouping,
      required: Math.min(options.length, Math.max(1, required)),
      options: [...options],
      certain,
      scope,
      partTitle,
    })
  }

  const walk = (
    node: unknown,
    ancestor: string | null,
    depth: number,
    certain: boolean,
    scope: string | null,
    partTitle: string | null
  ): void => {
    if (Array.isArray(node)) {
      for (const x of node) walk(x, ancestor, depth, certain, scope, partTitle)
      return
    }
    if (!node || typeof node !== "object") return
    const n = node as Record<string, unknown>

    const title =
      typeof n["title"] === "string"
        ? n["title"]
        : typeof n["name"] === "string"
          ? (n["name"] as string)
          : null
    const childAncestor = title || ancestor
    const childScope = (title && detectScope(title)) || scope
    const childPartTitle = depth === 1 ? title : partTitle

    // The root node usually has no credit_points of its own; fall back
    // to the course/AoS total so top-level Parts get the same budget
    // treatment as nested containers (A0503 lists 228cp of alternative
    // discipline streams on a 48cp diploma — walking them all as
    // mandatory force-loaded three degrees' worth of units).
    const containerCp =
      depth === 0
        ? numeric(n["credit_points"]) || totalCp
        : numeric(n["credit_points"])
    const subs = Array.isArray(n["container"])
      ? (n["container"] as unknown[])
      : []
    const contributing = subs.filter(
      (s): s is Record<string, unknown> =>
        !!s &&
        typeof s === "object" &&
        numeric((s as Record<string, unknown>)["credit_points"]) > 0
    )
    // Only unit-bearing, non-flexible subs compete for the parent
    // budget in the mandatory-sub test:
    // - prose-only / AoS-ref-only containers (E3001's empty 192cp
    //   "Course requirements" umbrella, major-picker Parts) claim no
    //   units, and counting them makes real cores look optional;
    // - elective / minor pools are flexible filler by definition —
    //   L3001: Parts A+B+C sum exactly with Part D "specialist law
    //   electives", so the LLB core is provably mandatory once the
    //   elective pool is treated as filler.
    const competing = contributing.filter(
      (s) => hasSubjectLeaf(s) && !isFlexibleTitle(s)
    )
    const totalCompeting = competing.reduce(
      (s, x) => s + numeric(x["credit_points"]),
      0
    )
    const subsAreChoice =
      containerCp > 0 && isChoiceContainer(containerCp, competing)

    // --- Direct subject leaves: emit as one requirement group
    const rels = n["relationship"]
    if (Array.isArray(rels) && rels.length > 0) {
      const subjects = rels
        .filter((r): r is Record<string, unknown> => isSubjectLeaf(r))
        .sort(byOrder)
      if (subjects.length > 0) {
        const grouping = childAncestor || "Course requirements"
        // The container budget also has to fund any cp-bearing
        // sub-containers sitting NEXT TO these leaves (B2001 Part A:
        // 42cp = 7 × 6cp leaves + a 6cp "Specified commerce elective"
        // sub — only 36cp of leaves fit, so the leaf list is 6-of-7,
        // not all-required). Alternatives draw once, not summed:
        // campus-scoped siblings (M3708 Part B) count their largest
        // scope, choice-shaped siblings (F2010 Part C: DGN1000 + five
        // 48cp studios under 60cp) count their largest member.
        const siblingSubCp = subsAreChoice
          ? Math.max(...contributing.map((s) => numeric(s["credit_points"])))
          : effectiveSiblingSubCp(subs)
        const leafBudget = containerCp - siblingSubCp
        const leafTotalCp = subjects.reduce(
          (s, r) => s + numeric(r["academic_item_credit_points"]),
          0
        )
        const codes = subjects.map((leaf) =>
          String(leaf["academic_item_code"]).toUpperCase()
        )
        let required: number
        let groupCertain = certain
        if (containerCp <= 0 && leafTotalCp <= 0) {
          // Zero-cp group (e.g. ENG0001/ENG0002 professional practice): the
          // credit-point math is useless here. Fall back to parent_connector
          // on the leaf items: if any leaf says OR, pick 1; otherwise all.
          const hasOr = subjects.some(
            (r) =>
              (r["parent_connector"] as { value?: string } | undefined)
                ?.value === "OR"
          )
          required = hasOr ? 1 : subjects.length
        } else if (containerCp > 0 && leafBudget <= 0) {
          // Sub-containers consume the entire budget; the leaves are a
          // side pool the math can't size. Never force-load.
          required = Math.min(subjects.length, UNCERTAIN_POOL_REQUIRED_CAP)
          groupCertain = false
        } else if (containerCp <= 0 || leafBudget >= leafTotalCp) {
          // On an uncertain path a budget-less container is a unit pool
          // ("complete 24cp from the following domains"), not a
          // must-do-all list — cap the display denominator.
          required =
            !certain && containerCp <= 0
              ? Math.min(subjects.length, UNCERTAIN_POOL_REQUIRED_CAP)
              : subjects.length
        } else {
          // Walk subjects in order, count how many fit the budget left
          // after sibling sub-containers take their share.
          let acc = 0
          let n = 0
          for (const leaf of subjects) {
            n++
            acc += numeric(leaf["academic_item_credit_points"])
            if (acc >= leafBudget) break
          }
          required = Math.max(1, n)
        }
        addGroup(
          grouping,
          codes,
          required,
          groupCertain,
          childScope,
          childPartTitle
        )
      }
    }

    // --- Sub-containers
    if (subs.length === 0) return

    if (containerCp <= 0) {
      for (const sub of subs)
        walk(sub, childAncestor, depth + 1, certain, childScope, childPartTitle)
      return
    }

    // Pick-one-of-N shape (e.g. S2000 "Level 1 science sequences":
    // 24cp parent, 8 × 12cp sequence subs): descending per-sub would
    // emit every alternative as its own "all required" group. Emit ONE
    // choice group over the union of subject leaves instead. Zero-cp
    // members of the choice (F2010's "Global design studio") join the
    // option pool too.
    // A single unit-bearing sub covering the parent's entire budget
    // alongside smaller partial views is an umbrella view of the whole
    // requirement — never optional. Two or more full-budget subs are
    // alternatives (C4006's "Full time study" / "Part time study"),
    // not umbrellas.
    const fullBudgetSubs = competing.filter(
      (s) => numeric(s["credit_points"]) >= containerCp
    )
    const umbrellaSub = fullBudgetSubs.length === 1 ? fullBudgetSubs[0] : null

    if (subsAreChoice) {
      const choiceSubs = [
        ...contributing,
        ...subs.filter(
          (s): s is Record<string, unknown> =>
            !!s &&
            typeof s === "object" &&
            numeric((s as Record<string, unknown>)["credit_points"]) <= 0 &&
            hasSubjectLeaf(s as Record<string, unknown>)
        ),
      ]
      const leaves = choiceSubs.flatMap((sub) => collectSubjectLeaves(sub))
      const seen = new Set<string>()
      const unique: Array<{ code: string; cp: number }> = []
      for (const leaf of leaves) {
        const code = String(leaf["academic_item_code"]).toUpperCase()
        if (seen.has(code)) continue
        seen.add(code)
        unique.push({
          code,
          cp: numeric(leaf["academic_item_credit_points"]),
        })
      }
      if (unique.length > 0) {
        // How many leading options does it take to fill the budget?
        let acc = 0
        let needed = 0
        for (const u of unique) {
          needed++
          acc += u.cp
          if (acc >= containerCp) break
        }
        addGroup(
          childAncestor || "Course requirements",
          unique.map((u) => u.code),
          // A choice container by definition can't require all options.
          Math.max(1, Math.min(needed, unique.length - 1)),
          false,
          childScope,
          childPartTitle
        )
      }
      return
    }

    for (const sub of subs) {
      if (!sub || typeof sub !== "object") continue
      const subRec = sub as Record<string, unknown>
      const subCp = numeric(subRec["credit_points"])
      if (subCp <= 0) {
        // Zero-cp sub-containers were historically skipped as
        // "reference lists", but ~49 courses (A2000 Bachelor of Arts
        // among them) keep genuine unit pools here. Descend on the
        // uncertain path whenever the subtree holds subject leaves —
        // recall-first: visible in requirements, never auto-loaded.
        if (hasSubjectLeaf(subRec)) {
          walk(sub, childAncestor, depth + 1, false, childScope, childPartTitle)
        }
        continue
      }
      // Mandatory test runs over the *competing* set: removing this
      // sub must leave the parent under budget once flexible pools and
      // unit-less containers are set aside. Flexible/unit-less subs
      // themselves can never be proven mandatory this way.
      const competes = competing.includes(subRec)
      const sumOthers = totalCompeting - (competes ? subCp : 0)
      const provenMandatory =
        competes && (subRec === umbrellaSub || sumOthers < containerCp)
      walk(
        sub,
        childAncestor,
        depth + 1,
        certain && provenMandatory,
        childScope,
        childPartTitle
      )
    }
  }

  walk(structure, null, 0, true, null, null)

  // --- Scope resolution: a scoped group may only auto-load when the
  // whole course is single-scoped (e.g. C2004, the Malaysia-campus
  // BIT, suffixes its real core with "- Malaysia"). Any unscoped
  // sibling or second scope means the scoped groups are campus
  // variants the student must choose between.
  const scopes = new Set<string>()
  let hasUnscoped = false
  for (const g of groups) {
    if (g.scope) scopes.add(g.scope)
    else hasUnscoped = true
  }
  const suppressScoped = scopes.size >= 2 || (scopes.size === 1 && hasUnscoped)

  // --- Display disambiguation for titles colliding across Parts.
  const titleCount = new Map<string, number>()
  for (const g of groups)
    titleCount.set(g.grouping, (titleCount.get(g.grouping) ?? 0) + 1)

  return groups.map((g) => {
    const collides = (titleCount.get(g.grouping) ?? 0) > 1
    const grouping =
      collides && g.partTitle && g.partTitle !== g.grouping
        ? `${g.partTitle} — ${g.grouping}`
        : g.grouping
    // A grouping that calls itself an elective is a student choice by
    // definition, even when the listed options' credit points happen
    // to equal the budget (C2004 Part C lists 8 × 6cp "electives"
    // under a 48cp budget — cp math alone would force-load all 8).
    const isElective = /\belective/i.test(g.grouping)
    const autoLoad =
      g.certain &&
      !isElective &&
      g.required === g.options.length &&
      !(g.scope && suppressScoped)
    return {
      grouping,
      required: g.required,
      options: g.options,
      autoLoad,
      ...(g.scope ? { scope: g.scope } : {}),
    }
  })
}

/**
 * Campus/offering scope detection over container titles. Returns a
 * normalised scope label ("Malaysia", "Clayton", "Caulfield and
 * Malaysia", "Indonesia", …) or null. Patterns seeded from a corpus
 * scan of all container titles (2020-2026); the eval harness reports
 * scoped-title candidates this misses.
 */
const CAMPUS_WORD =
  "(?:malaysia[n]?|indonesia[n]?|clayton|caulfield|peninsula|parkville|suzhou|south\\s*-?\\s*east(?:ern)?\\s+university|southeast\\s+university|seu|mum)"

const SCOPE_PATTERNS: RegExp[] = [
  // "Core studies - Malaysia", "stream (Clayton)", "Discipline areas - MALAYSIA",
  // "Part D. Specialist study - Clayton (12-18 credit points)"
  new RegExp(`[-–—(]\\s*${CAMPUS_WORD}\\b`, "i"),
  // "CLAYTON: Mathematical science units", "Clayton - additional core
  // units", "Malaysia - additional units"
  new RegExp(`^\\s*(?:[a-z]\\.\\s*)?${CAMPUS_WORD}\\s*[-–—:(]`, "i"),
  // Whole-title campus designators: "Clayton", "a. Malaysia",
  // "Malaysia options", "Malaysia only", "Caulfield/Clayton",
  // "b. Caulfield and Malaysia", "SEU, Suzhou", "Malaysia students"
  new RegExp(
    `^\\s*(?:[a-z]\\.\\s*)?${CAMPUS_WORD}(?:\\s*(?:and|/|,)\\s*${CAMPUS_WORD}(?:\\s*\\([^)]*\\))?)*\\s*(?:\\([^)]*\\)\\s*)?(?:campus|students|options?(?:\\s+[a-z])?\\.?|offerings?|only|honours research areas)?\\s*(?:\\([^)]*\\))?\\s*$`,
    "i"
  ),
  // "For the Indonesia offering only", "Monash University Malaysia (MUM) students"
  new RegExp(`for\\s+(?:the\\s+)?[\\w\\s]*${CAMPUS_WORD}[\\w\\s]*offering`, "i"),
  new RegExp(`${CAMPUS_WORD}[\\w\\s()]*\\bstudents\\s*$`, "i"),
  // "Indonesian studies", "Indonesian units", "Global studies electives (Indonesia units)"
  new RegExp(`\\bindonesian?\\s+(?:studies|units|programs)\\b`, "i"),
]

// Titles that merely *mention* a campus without scoping requirements.
const SCOPE_EXCLUDE = /accreditation|important\s+in[f]?ormation/i

export function detectScope(title: string): string | null {
  if (SCOPE_EXCLUDE.test(title)) return null
  if (!SCOPE_PATTERNS.some((p) => p.test(title))) return null
  // Normalise: collect the campus words present, title-cased, joined.
  const found = new Set<string>()
  const wordRe = new RegExp(CAMPUS_WORD, "gi")
  for (const m of title.matchAll(wordRe)) {
    const raw = m[0].toLowerCase().replace(/\s+/g, " ")
    const norm =
      raw === "malaysian"
        ? "malaysia"
        : raw === "indonesian"
          ? "indonesia"
          : /south\s*-?\s*east|southeast|^seu$/.test(raw)
            ? "SEU"
            : raw === "mum"
              ? "malaysia"
              : raw
    found.add(
      norm === "SEU" ? norm : norm.charAt(0).toUpperCase() + norm.slice(1)
    )
  }
  if (found.size === 0) return null
  return [...found].sort().join(" and ")
}

/**
 * Credit points that sibling sub-containers claim from a parent budget
 * shared with direct leaves. Unscoped subs all draw from the budget;
 * campus-scoped subs are variants of each other, so only the largest
 * single scope draws (a student attends one campus).
 */
function effectiveSiblingSubCp(container: unknown): number {
  if (!Array.isArray(container)) return 0
  let unscoped = 0
  const byScope = new Map<string, number>()
  for (const sub of container) {
    if (!sub || typeof sub !== "object") continue
    const rec = sub as Record<string, unknown>
    const cp = numeric(rec["credit_points"])
    if (cp <= 0) continue
    const title = typeof rec["title"] === "string" ? rec["title"] : null
    const scope = title ? detectScope(title) : null
    if (scope) byScope.set(scope, (byScope.get(scope) ?? 0) + cp)
    else unscoped += cp
  }
  const maxScoped = byScope.size > 0 ? Math.max(...byScope.values()) : 0
  return unscoped + maxScoped
}

/**
 * Pick-one-of-N sub-container shape shared by the requirement-group
 * walker and `extractEmbeddedSpecialisations`: at least three
 * contributing subs, each at least half the parent budget, together
 * exceeding it (so they cannot all be required simultaneously). See
 * the `extractEmbeddedSpecialisations` header for why ≥ 3, not ≥ 2.
 */
function isChoiceContainer(
  parentCp: number,
  contributing: ReadonlyArray<Record<string, unknown>>
): boolean {
  if (parentCp <= 0 || contributing.length < 3) return false
  const total = contributing.reduce(
    (acc, s) => acc + numeric(s["credit_points"]),
    0
  )
  return (
    total > parentCp &&
    contributing.every((s) => numeric(s["credit_points"]) >= parentCp / 2)
  )
}

/**
 * Deep-collect subject leaves under a container in handbook order
 * (container order, then leaf `order`). Course/AoS trees only nest via
 * `container`/`relationship` (verified corpus-wide, all years).
 */
function collectSubjectLeaves(
  node: Record<string, unknown>
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const rels = node["relationship"]
  if (Array.isArray(rels)) {
    const subjects = rels
      .filter((r): r is Record<string, unknown> => isSubjectLeaf(r))
      .sort(byOrder)
    out.push(...subjects)
  }
  const subs = node["container"]
  if (Array.isArray(subs)) {
    for (const sub of subs) {
      if (sub && typeof sub === "object")
        out.push(...collectSubjectLeaves(sub as Record<string, unknown>))
    }
  }
  return out
}

/**
 * Elective / minor pools are flexible filler: their credit points are
 * real, but they never make a sibling core look optional, and they can
 * never themselves be proven mandatory by budget math.
 */
const FLEXIBLE_TITLE = /\belective|\bminors?\b/i

function isFlexibleTitle(node: Record<string, unknown>): boolean {
  const t = node["title"]
  return typeof t === "string" && FLEXIBLE_TITLE.test(t)
}

function hasSubjectLeaf(node: Record<string, unknown>): boolean {
  const rels = node["relationship"]
  if (Array.isArray(rels) && rels.some(isSubjectLeaf)) return true
  const subs = node["container"]
  if (Array.isArray(subs)) {
    for (const sub of subs) {
      if (
        sub &&
        typeof sub === "object" &&
        hasSubjectLeaf(sub as Record<string, unknown>)
      )
        return true
    }
  }
  return false
}

/**
 * Flatten requirement groups into the "default load" list — only groups
 * where every listed option is required (required === options.length).
 * Choice groups ("pick 1 of 2", elective pools, etc.) are skipped so the
 * template never auto-places an optional unit.
 */
export function pickDefaultUnits(
  groups: readonly RequirementGroup[]
): Array<{ code: string; grouping: string }> {
  const out: Array<{ code: string; grouping: string }> = []
  const seen = new Set<string>()
  for (const g of groups) {
    // `autoLoad` is the explicit precision-first signal; rows baked
    // before the field existed fall back to the legacy rule.
    if (!(g.autoLoad ?? g.required === g.options.length)) continue
    for (const code of g.options) {
      const key = `${code}|${g.grouping}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ code, grouping: g.grouping })
    }
  }
  return out
}

/**
 * Convenience: extract only the fully-required units directly from raw
 * curriculum JSONB. Equivalent to
 * `pickDefaultUnits(extractRequirementGroups(structure))`.
 */
export function extractUnitRefs(
  structure: unknown
): Array<{ code: string; grouping: string }> {
  return pickDefaultUnits(extractRequirementGroups(structure))
}

/**
 * Extract "choice containers" — parents whose sub-containers are
 * specialisation-style alternatives (each sub roughly the size of the
 * parent budget; sum of subs exceeds the parent). Each detected
 * specialisation comes back as one entry, with its title, parent
 * grouping, the unit codes it pins, and its credit-point budget.
 *
 * Detection rule: for a parent at depth ≥ 1 with credit_points > 0,
 * if ≥ 3 non-zero sub-containers each have `cp ≥ parent.cp / 2` AND
 * the total subs CP exceeds parent CP, treat the parent as a "pick
 * one" choice and emit each sub as a separate `EmbeddedSpecialisation`.
 *
 * Why ≥ 3, not ≥ 2: when only two sub-containers each equal the
 * parent's CP, the math is ambiguous — the handbook could mean "pick
 * one" or "do both" depending on whether the author put the parent
 * budget at the per-component value or the total. We've observed both
 * patterns (E3001 2022/2023 Part A is the false-positive case;
 * masters specialisations are the true-choice case). When in doubt,
 * fall through to the standard requirement-group walker, which treats
 * them as mandatory — the user sees both, which beats silently hiding
 * one.
 *
 * Patterns this catches:
 *  - F2010 Part C (60cp) → 5 studios at 48cp each → 5 specialisations
 *  - C2001 Part D (12cp) → 5 tracks at 12cp each → 5 specialisations
 * Patterns it correctly skips:
 *  - B2029 Part B (72cp) → 6cp pools → not specialisations
 *  - E3002 Engineering (144cp) → mandatory parts summing to 144 → not
 *    specialisations
 *  - E3001 (2022/2023) Part A (12cp) → 2 mandatory 12cp sub-pairs →
 *    treated as mandatory, not as alternatives.
 */
export interface EmbeddedSpecialisation {
  /** Sub-container title (e.g. "Communication design"). */
  title: string
  /** Parent container title (e.g. "Part C. Studio practices"). */
  parentTitle: string
  /** Slug suitable for synthesizing a stable AoS code. */
  slug: string
  /** Parent's slug — disambiguates same-name specs across parts. */
  parentSlug: string
  /** Credit-point budget for picking this specialisation. */
  creditPoints: number
  /** Per-grouping requirement structure inside this specialisation. */
  requirements: RequirementGroup[]
}

export function extractEmbeddedSpecialisations(
  structure: unknown
): EmbeddedSpecialisation[] {
  const out: EmbeddedSpecialisation[] = []

  const walk = (
    node: unknown,
    parentTitle: string | null,
    depth: number
  ): void => {
    if (Array.isArray(node)) {
      for (const x of node) walk(x, parentTitle, depth)
      return
    }
    if (!node || typeof node !== "object") return
    const n = node as Record<string, unknown>

    const title =
      typeof n["title"] === "string"
        ? (n["title"] as string)
        : typeof n["name"] === "string"
          ? (n["name"] as string)
          : null

    const subs = n["container"]
    if (!Array.isArray(subs) || subs.length === 0) return

    // Detection only kicks in at depth ≥ 1 — depth 0 is the root
    // wrapper that has no credit-point budget of its own.
    if (depth >= 1) {
      const parentCp = numeric(n["credit_points"])
      if (parentCp > 0) {
        const contributing = subs.filter(
          (s): s is Record<string, unknown> =>
            !!s &&
            typeof s === "object" &&
            numeric((s as Record<string, unknown>)["credit_points"]) > 0
        )
        // Shared with extractRequirementGroups, which emits the same
        // shape as a single flattened choice group. See header comment
        // for why the predicate requires ≥ 3 contributors, not ≥ 2.
        if (isChoiceContainer(parentCp, contributing)) {
          const parentSlug = slugify(title ?? parentTitle ?? "")
          for (const sub of contributing) {
            const subTitle =
              (typeof sub["title"] === "string"
                ? (sub["title"] as string)
                : null) ?? "(untitled specialisation)"
            const subCp = numeric(sub["credit_points"])
            // Build the requirements *inside* this specialisation by
            // running the standard walker over its subtree. We inject
            // a fresh `container` wrapper at depth 0 so the inner walker
            // emits all leaves of this sub.
            const reqs = extractRequirementGroups({ container: [sub] })
            out.push({
              title: subTitle,
              parentTitle: title ?? parentTitle ?? "Course requirements",
              slug: slugify(subTitle),
              parentSlug,
              creditPoints: subCp,
              requirements: reqs,
            })
          }
          // Don't descend into a choice container — the embedded
          // specialisations *replace* the parent's normal extraction.
          return
        }
      }
    }
    // Recurse into every child to find choice containers anywhere
    // in the tree (including the root level).
    for (const sub of subs) walk(sub, title ?? parentTitle, depth + 1)
  }

  walk(structure, null, 0)
  return out
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

function isSubjectLeaf(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== "object") return false
  const n = node as Record<string, unknown>
  if (typeof n["academic_item_code"] !== "string") return false
  const typeRef = n["academic_item_type"] as { value?: string } | undefined
  return typeRef?.value === "subject"
}

function numeric(v: unknown): number {
  if (typeof v === "number") return v
  if (typeof v === "string") {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function byOrder(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): number {
  return numeric(a["order"]) - numeric(b["order"])
}

/**
 * Walk the full curriculumStructure tree and return every course
 * reference (`academic_item_type.value === "course"`) found in any
 * `relationship[]` array. Each ref is paired with the nearest
 * ancestor container title to disambiguate double-degree components
 * (e.g. E3010 → C2001 + E3001) from deeply-nested course-pointer
 * requirements (M6041 Public Health, A6039 etc.).
 *
 * Previously this only inspected depth-1 `container[*].relationship[*]`,
 * which silently dropped 22 courses whose course refs nest deeper.
 */
export interface SubCourseRef {
  componentTitle: string
  courseCode: string
}

export function extractSubCourseRefs(structure: unknown): SubCourseRef[] {
  const out: SubCourseRef[] = []
  const seen = new Set<string>()

  const walk = (node: unknown, ancestor: string): void => {
    if (Array.isArray(node)) {
      for (const x of node) walk(x, ancestor)
      return
    }
    if (!node || typeof node !== "object") return
    const n = node as Record<string, unknown>
    const title =
      typeof n["title"] === "string"
        ? (n["title"] as string)
        : typeof n["name"] === "string"
          ? (n["name"] as string)
          : null
    const childAncestor = title || ancestor

    const rels = n["relationship"]
    if (Array.isArray(rels)) {
      for (const rel of rels) {
        if (!rel || typeof rel !== "object") continue
        const r = rel as Record<string, unknown>
        const typeRef = r["academic_item_type"] as
          | { value?: string }
          | undefined
        if (typeRef?.value !== "course") continue
        const code =
          typeof r["academic_item_code"] === "string"
            ? (r["academic_item_code"] as string)
            : null
        if (!code) continue
        const componentTitle = childAncestor || "Course requirements"
        const key = `${componentTitle}|${code}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ componentTitle, courseCode: code })
      }
    }
    for (const v of Object.values(n)) walk(v, childAncestor)
  }

  walk(structure, "")
  return out
}

/**
 * Walk the top-level containers of a course's curriculumStructure and
 * return a record of code → depth-1 ancestor container title. Used to
 * label per-degree specialisation pickers in double degrees (e.g.
 * "Computer Science component", "Engineering component").
 *
 * Stores every `academic_item_code` leaf encountered — callers filter
 * down to the AoS codes they actually care about at query time.
 */
export type ComponentLabelMap = Record<string, string>

export function extractComponentLabels(structure: unknown): ComponentLabelMap {
  const out: ComponentLabelMap = {}
  if (!structure || typeof structure !== "object") return out
  const root = structure as Record<string, unknown>
  const containers = root["container"]
  if (!Array.isArray(containers)) return out

  const walk = (node: unknown, depth1Title: string): void => {
    if (Array.isArray(node)) {
      for (const x of node) walk(x, depth1Title)
      return
    }
    if (!node || typeof node !== "object") return
    const n = node as Record<string, unknown>
    const code = n["academic_item_code"]
    if (typeof code === "string") {
      const upper = code.toUpperCase()
      if (!(upper in out)) out[upper] = depth1Title
    }
    for (const v of Object.values(n)) walk(v, depth1Title)
  }

  for (const c of containers) {
    if (!c || typeof c !== "object") continue
    const title = (c as Record<string, unknown>)["title"]
    if (typeof title === "string" && title) walk(c, title)
  }
  return out
}
