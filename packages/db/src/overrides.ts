/**
 * Curriculum overrides: hand corrections to extracted requirement
 * groups that the credit-point heuristics cannot derive (e.g. "SCI1000
 * is universally required even though S2000's Part A is intentionally
 * over-budget").
 *
 * Overrides used to live in one-off SQL migrations (0008), which the
 * ingest pipeline silently wiped on its next delete-and-reinsert. The
 * data now lives in a checked-in JSON file
 * (`packages/ingest/data/curriculum-overrides.json`) and is applied by
 * every writer of `courses.requirement_groups` — full ingest, the
 * backfill/recompute script, and the standalone `overrides:apply` CLI
 * — so a data refresh can never lose a fix again.
 *
 * This module is the pure applier; it has no IO so it can be unit
 * tested alongside the extractor and imported anywhere.
 */
import type { RequirementGroup } from "./curriculum.ts";

export type OverrideOp =
  /** Append a new group (deduped by grouping title). */
  | { op: "addGroup"; group: RequirementGroup }
  /** Remove all groups whose grouping matches (case-insensitive substring). */
  | { op: "removeGroup"; groupingLike: string }
  /** Force the auto-load verdict on matching groups. */
  | { op: "setAutoLoad"; groupingLike: string; autoLoad: boolean }
  /** Override the required count on matching groups. */
  | { op: "setRequired"; groupingLike: string; required: number }
  /** Drop an option from matching groups (e.g. a campus-specific unit). */
  | { op: "removeOption"; groupingLike: string; code: string }
  /** Escape hatch: replace the whole extraction result. */
  | { op: "replaceGroups"; groups: RequirementGroup[] };

export interface CurriculumOverride {
  /** Course code the override applies to. */
  course: string;
  /** Handbook years; absent = every year. */
  years?: string[];
  /** Mandatory human explanation (link the handbook page / report). */
  reason: string;
  ops: OverrideOp[];
}

const matches = (grouping: string, like: string): boolean =>
  grouping.toLowerCase().includes(like.toLowerCase());

/**
 * Apply every override matching (course, year) to `groups`, in file
 * order. Returns the (possibly new) group list plus the reasons of the
 * overrides that applied, for logging.
 */
export function applyCurriculumOverrides(
  course: string,
  year: string,
  groups: readonly RequirementGroup[],
  overrides: readonly CurriculumOverride[],
): { groups: RequirementGroup[]; applied: string[] } {
  let out: RequirementGroup[] = groups.map((g) => ({
    ...g,
    options: [...g.options],
  }));
  const applied: string[] = [];

  for (const ov of overrides) {
    if (ov.course.toUpperCase() !== course.toUpperCase()) continue;
    if (ov.years && !ov.years.includes(year)) continue;
    applied.push(ov.reason);

    for (const op of ov.ops) {
      switch (op.op) {
        case "addGroup": {
          if (!out.some((g) => g.grouping === op.group.grouping)) {
            out.push({ ...op.group, options: [...op.group.options] });
          }
          break;
        }
        case "removeGroup": {
          out = out.filter((g) => !matches(g.grouping, op.groupingLike));
          break;
        }
        case "setAutoLoad": {
          for (const g of out) {
            if (matches(g.grouping, op.groupingLike)) g.autoLoad = op.autoLoad;
          }
          break;
        }
        case "setRequired": {
          for (const g of out) {
            if (matches(g.grouping, op.groupingLike)) {
              g.required = Math.min(
                g.options.length,
                Math.max(1, op.required),
              );
            }
          }
          break;
        }
        case "removeOption": {
          for (const g of out) {
            if (!matches(g.grouping, op.groupingLike)) continue;
            g.options = g.options.filter(
              (c) => c.toUpperCase() !== op.code.toUpperCase(),
            );
            g.required = Math.min(g.required, g.options.length);
          }
          out = out.filter((g) => g.options.length > 0);
          break;
        }
        case "replaceGroups": {
          out = op.groups.map((g) => ({ ...g, options: [...g.options] }));
          break;
        }
      }
    }
  }
  return { groups: out, applied };
}

/** Structural validation for the checked-in overrides file. */
export function validateCurriculumOverrides(
  data: unknown,
): asserts data is CurriculumOverride[] {
  if (!Array.isArray(data)) throw new Error("overrides: root must be an array");
  data.forEach((ov, i) => {
    if (!ov || typeof ov !== "object")
      throw new Error(`overrides[${i}]: not an object`);
    const o = ov as Record<string, unknown>;
    if (typeof o["course"] !== "string" || !o["course"])
      throw new Error(`overrides[${i}]: missing course`);
    if (typeof o["reason"] !== "string" || !o["reason"])
      throw new Error(`overrides[${i}] (${o["course"]}): missing reason`);
    if (
      o["years"] !== undefined &&
      (!Array.isArray(o["years"]) ||
        !o["years"].every((y) => typeof y === "string"))
    )
      throw new Error(`overrides[${i}] (${o["course"]}): years must be string[]`);
    if (!Array.isArray(o["ops"]) || o["ops"].length === 0)
      throw new Error(`overrides[${i}] (${o["course"]}): ops must be non-empty`);
    for (const op of o["ops"] as Array<Record<string, unknown>>) {
      const kind = op?.["op"];
      if (
        kind !== "addGroup" &&
        kind !== "removeGroup" &&
        kind !== "setAutoLoad" &&
        kind !== "setRequired" &&
        kind !== "removeOption" &&
        kind !== "replaceGroups"
      )
        throw new Error(
          `overrides[${i}] (${o["course"]}): unknown op ${String(kind)}`,
        );
    }
  });
}
