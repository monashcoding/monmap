import type { PlannerOffering, PlannerUnit, RequisiteBlock } from "./types.ts"

/**
 * Unit data as the server sends it: plain objects keyed by unit code,
 * because Next.js can't serialise a Map.
 */
export interface UnitBundle {
  units: Record<string, PlannerUnit>
  offerings: Record<string, PlannerOffering[]>
  requisites: Record<string, RequisiteBlock[]>
}

/** The same data as the planner holds it. */
export interface UnitMaps {
  units: Map<string, PlannerUnit>
  offerings: Map<string, PlannerOffering[]>
  requisites: Map<string, RequisiteBlock[]>
}

export function unitMapsFrom(bundle: UnitBundle): UnitMaps {
  return {
    units: new Map(Object.entries(bundle.units)),
    offerings: new Map(Object.entries(bundle.offerings)),
    requisites: new Map(Object.entries(bundle.requisites)),
  }
}

/**
 * `maps` with `bundle` written over it. Each code in `fillEmpty` that
 * still has no offerings or requisites gets an empty list, so a unit
 * with none is not asked for again. New maps, so React sees a change.
 */
export function mergeUnitMaps(
  maps: UnitMaps,
  bundle: UnitBundle,
  fillEmpty: readonly string[] = []
): UnitMaps {
  const units = new Map(maps.units)
  const offerings = new Map(maps.offerings)
  const requisites = new Map(maps.requisites)
  for (const [k, v] of Object.entries(bundle.units)) units.set(k, v)
  for (const [k, v] of Object.entries(bundle.offerings)) offerings.set(k, v)
  for (const [k, v] of Object.entries(bundle.requisites)) requisites.set(k, v)
  for (const code of fillEmpty) {
    if (!offerings.has(code)) offerings.set(code, [])
    if (!requisites.has(code)) requisites.set(code, [])
  }
  return { units, offerings, requisites }
}

/** One unit's data out of `maps`, for merging into another cache. */
export function unitBundleFor(maps: UnitMaps, code: string): UnitBundle {
  const unit = maps.units.get(code)
  const offerings = maps.offerings.get(code)
  const requisites = maps.requisites.get(code)
  return {
    units: unit ? { [code]: unit } : {},
    offerings: offerings ? { [code]: offerings } : {},
    requisites: requisites ? { [code]: requisites } : {},
  }
}
