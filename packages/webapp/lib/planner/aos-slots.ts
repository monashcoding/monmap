import type {
  PlannerAreaOfStudy,
  PlannerCourseWithAoS,
  PlannerState,
} from "./types.ts"

/**
 * Selection slots: which area-of-study picks a course offers, where
 * each pick is stored in `PlannerState.selectedAos`, and how saved
 * plans written before component scoping keep working.
 *
 * A slot is one dropdown in the picker. Single degrees get the classic
 * fixed roles ("major", "specialisation", …). Double degrees get one
 * slot per (kind × component) — and per specialisation group within a
 * component, because C2001 inside S2004 genuinely asks for a Part C
 * specialisation AND a Part D studio — keyed "<kind>@<scope>" so a
 * Science major and a CS specialisation are separate picks.
 *
 * Legacy compatibility is read-side: every slot lists the fixed-role
 * keys that historically stored picks of its kind, and a legacy value
 * counts for the slot exactly when its code is one of the slot's
 * options. AoS codes belong to exactly one component (the resolver
 * de-duplicates), so membership is unambiguous.
 */

export interface AosSlot {
  /** `selectedAos` key this slot reads/writes, e.g. "major" or "major@S2000". */
  key: string
  kind: PlannerAreaOfStudy["kind"]
  /** Picker heading, e.g. "Major" or "Computer Science specialisation". */
  label: string
  options: PlannerAreaOfStudy[]
  /** Fixed-role keys consulted (in order) when `key` itself is unset. */
  legacyKeys: string[]
}

const KIND_LABEL: Record<PlannerAreaOfStudy["kind"], string> = {
  major: "Major",
  extended_major: "Extended major",
  minor: "Minor",
  specialisation: "Specialisation",
  elective: "Elective stream",
  other: "Other",
}

const KIND_LEGACY_KEYS: Record<PlannerAreaOfStudy["kind"], string[]> = {
  major: ["major"],
  extended_major: ["extendedMajor"],
  minor: ["minor"],
  specialisation: ["specialisation", "specialisation2"],
  elective: ["elective"],
  other: [],
}

/** "Computer Science component" → "Computer Science". */
function cleanComponentLabel(label: string): string {
  return label.replace(/\s*component\s*$/i, "").trim()
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Stable scope suffix for a component-scoped slot key. */
function componentScope(aos: PlannerAreaOfStudy): string | null {
  return aos.componentCourseCode ?? null
}

/**
 * Compute the selection slots a course offers. Order: majors, extended
 * majors, specialisations, minors, electives (matching the AoS sort
 * the resolver already applies), components in first-seen order.
 */
export function computeAosSlots(course: PlannerCourseWithAoS): AosSlot[] {
  const byKind = new Map<PlannerAreaOfStudy["kind"], PlannerAreaOfStudy[]>()
  for (const a of course.areasOfStudy) {
    const list = byKind.get(a.kind) ?? []
    list.push(a)
    byKind.set(a.kind, list)
  }

  const slots: AosSlot[] = []

  const simpleKinds: PlannerAreaOfStudy["kind"][] = ["major", "extended_major"]
  for (const kind of simpleKinds) slots.push(...slotsForKind(byKind, kind))
  slots.push(...specialisationSlots(byKind))
  slots.push(...slotsForKind(byKind, "minor"))
  slots.push(...slotsForKind(byKind, "elective"))
  return slots
}

/**
 * One slot per component for a non-specialisation kind. When no AoS of
 * the kind is component-scoped, this degenerates to the single legacy
 * fixed-role slot — byte-for-byte the pre-scoping picker.
 */
function slotsForKind(
  byKind: ReadonlyMap<PlannerAreaOfStudy["kind"], PlannerAreaOfStudy[]>,
  kind: PlannerAreaOfStudy["kind"]
): AosSlot[] {
  const all = byKind.get(kind) ?? []
  if (all.length === 0) return []
  const legacyKeys = KIND_LEGACY_KEYS[kind]

  const byComponent = new Map<string | null, PlannerAreaOfStudy[]>()
  for (const a of all) {
    const scope = componentScope(a)
    const list = byComponent.get(scope) ?? []
    list.push(a)
    byComponent.set(scope, list)
  }

  const groups = [...byComponent.entries()]
  return groups.map(([scope, options]) => {
    if (scope === null) {
      return {
        key: legacyKeys[0] ?? kind,
        kind,
        label: KIND_LABEL[kind],
        options,
        legacyKeys,
      }
    }
    const componentLabel = options[0]?.componentLabel
    const label = componentLabel
      ? `${cleanComponentLabel(componentLabel)} ${KIND_LABEL[kind].toLowerCase()}`
      : KIND_LABEL[kind]
    return {
      key: `${kind}@${scope}`,
      kind,
      // With a single component offering this kind, the qualifier is
      // still useful ("Science major" tells a double-degree student
      // which half it belongs to).
      label: groups.length > 1 || componentLabel ? label : KIND_LABEL[kind],
      options,
      legacyKeys,
    }
  })
}

/**
 * Specialisations additionally split *within* a component by their
 * relationship label: C2001 has a Part C specialisation picker and a
 * Part D applied-studies picker, and keeps both inside S2004.
 * Unscoped courses preserve the historical two fixed roles
 * ("specialisation", "specialisation2") in group order.
 */
function specialisationSlots(
  byKind: ReadonlyMap<PlannerAreaOfStudy["kind"], PlannerAreaOfStudy[]>
): AosSlot[] {
  const specs = byKind.get("specialisation") ?? []
  if (specs.length === 0) return []
  const legacyKeys = KIND_LEGACY_KEYS.specialisation

  interface Group {
    scope: string | null
    subLabel: string
    options: PlannerAreaOfStudy[]
  }
  const groups: Group[] = []
  const groupIndex = new Map<string, Group>()
  for (const a of specs) {
    const scope = componentScope(a)
    // Inside a component, the relationship label distinguishes the
    // Part C / Part D pickers; virtual AoS carry their parent title
    // there. Unscoped courses group by componentLabel first (legacy
    // behaviour for pre-2023 double degrees with direct links).
    const subLabel =
      scope === null
        ? (a.componentLabel ?? a.relationshipLabel)
        : a.relationshipLabel
    const mapKey = `${scope ?? ""}|${subLabel}`
    let g = groupIndex.get(mapKey)
    if (!g) {
      g = { scope, subLabel, options: [] }
      groupIndex.set(mapKey, g)
      groups.push(g)
    }
    g.options.push(a)
  }

  const multiGroup = groups.length > 1
  return groups.map((g, i) => {
    if (g.scope === null) {
      const cleaned = cleanComponentLabel(g.subLabel)
      return {
        // Historical keys in group order: first group "specialisation",
        // second "specialisation2"; further unscoped groups get stable
        // label-keyed slots (previously they were silently dropped).
        key: legacyKeys[i] ?? `specialisation@${slug(g.subLabel)}`,
        kind: "specialisation" as const,
        label: multiGroup ? `${cleaned} specialisation` : "Specialisation",
        options: g.options,
        legacyKeys,
      }
    }
    const componentLabel = g.options[0]?.componentLabel
    const cleanedComponent = componentLabel
      ? cleanComponentLabel(componentLabel)
      : g.scope
    const siblingGroups = groups.filter((o) => o.scope === g.scope).length
    return {
      key: `specialisation@${g.scope}:${slug(g.subLabel)}`,
      kind: "specialisation" as const,
      label:
        siblingGroups > 1
          ? `${cleanedComponent}: ${g.subLabel}`
          : `${cleanedComponent} specialisation`,
      options: g.options,
      legacyKeys,
    }
  })
}

/**
 * The code currently selected for a slot: the slot's own key wins;
 * otherwise a legacy fixed-role value counts when it names one of this
 * slot's options.
 */
export function resolveSlotSelection(
  selectedAos: PlannerState["selectedAos"],
  slot: AosSlot
): string | undefined {
  const direct = selectedAos[slot.key]
  if (direct) return direct
  for (const lk of slot.legacyKeys) {
    const v = selectedAos[lk]
    if (v && slot.options.some((o) => o.code === v)) return v
  }
  return undefined
}

/**
 * Which legacy key is currently serving this slot's value (so a write
 * to the slot can clear it and the old pick doesn't resurface).
 */
export function legacyKeyServing(
  selectedAos: PlannerState["selectedAos"],
  slot: AosSlot
): string | undefined {
  if (selectedAos[slot.key]) return undefined
  for (const lk of slot.legacyKeys) {
    const v = selectedAos[lk]
    if (v && slot.options.some((o) => o.code === v)) return lk
  }
  return undefined
}

export interface PickedAosEntry {
  slotKey: string
  label: string
  aos: PlannerAreaOfStudy
}

/**
 * Every picked AoS with a display label, de-duplicated by code.
 * Slot-resolved picks come first; any remaining `selectedAos` values
 * that match a course AoS (stale keys from an older picker layout)
 * still surface, labelled by their kind, so a pick never silently
 * disappears from the requirements panel.
 */
export function pickedAosEntries(
  course: PlannerCourseWithAoS,
  selectedAos: PlannerState["selectedAos"]
): PickedAosEntry[] {
  const out: PickedAosEntry[] = []
  const seenCodes = new Set<string>()

  for (const slot of computeAosSlots(course)) {
    const code = resolveSlotSelection(selectedAos, slot)
    if (!code || seenCodes.has(code)) continue
    const aos = course.areasOfStudy.find((a) => a.code === code)
    if (!aos) continue
    seenCodes.add(code)
    out.push({ slotKey: slot.key, label: KIND_LABEL[slot.kind], aos })
  }

  for (const [key, code] of Object.entries(selectedAos)) {
    if (!code || seenCodes.has(code)) continue
    const aos = course.areasOfStudy.find((a) => a.code === code)
    if (!aos) continue
    seenCodes.add(code)
    out.push({ slotKey: key, label: KIND_LABEL[aos.kind], aos })
  }

  return out
}
