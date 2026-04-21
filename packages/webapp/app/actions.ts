"use server";

import {
  fetchCourseWithAoS,
  hydratePlannerUnits,
  searchUnits,
} from "@/lib/db/queries";
import type {
  PlannerCourseWithAoS,
  PlannerOffering,
  PlannerUnit,
  RequisiteBlock,
} from "@/lib/planner/types";

export async function loadCourseAction(
  code: string,
): Promise<PlannerCourseWithAoS | null> {
  return fetchCourseWithAoS(code);
}

export async function searchUnitsAction(query: string): Promise<PlannerUnit[]> {
  return searchUnits(query);
}

/**
 * Convert the maps to plain objects so Next.js can serialize them
 * across the server/client boundary.
 */
export async function hydrateUnitsAction(codes: string[]): Promise<{
  units: Record<string, PlannerUnit>;
  offerings: Record<string, PlannerOffering[]>;
  requisites: Record<string, RequisiteBlock[]>;
}> {
  const { units, offerings, requisites } = await hydratePlannerUnits(codes);
  return {
    units: Object.fromEntries(units),
    offerings: Object.fromEntries(offerings),
    requisites: Object.fromEntries(requisites),
  };
}
