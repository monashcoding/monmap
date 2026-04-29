"use server"

import {
  fetchCourseWithAoS,
  hydratePlannerUnits,
  listAvailableYears,
  listCoursesForPicker,
  searchUnits,
} from "@/lib/db/queries"
import type {
  PlannerCourse,
  PlannerCourseWithAoS,
  PlannerOffering,
  PlannerUnit,
  RequisiteBlock,
} from "@/lib/planner/types"

export async function loadCourseAction(
  code: string,
  year: string
): Promise<PlannerCourseWithAoS | null> {
  return fetchCourseWithAoS(code, year)
}

export async function searchUnitsAction(
  query: string,
  year: string
): Promise<PlannerUnit[]> {
  return searchUnits(query, 25, year)
}

export async function listCoursesAction(
  search: string | null,
  year: string
): Promise<PlannerCourse[]> {
  return listCoursesForPicker(search, 300, year)
}

export async function listAvailableYearsAction(): Promise<string[]> {
  return listAvailableYears()
}

/**
 * Convert the maps to plain objects so Next.js can serialize them
 * across the server/client boundary.
 */
export async function hydrateUnitsAction(
  codes: string[],
  year: string
): Promise<{
  units: Record<string, PlannerUnit>
  offerings: Record<string, PlannerOffering[]>
  requisites: Record<string, RequisiteBlock[]>
}> {
  const { units, offerings, requisites } = await hydratePlannerUnits(
    codes,
    year
  )
  return {
    units: Object.fromEntries(units),
    offerings: Object.fromEntries(offerings),
    requisites: Object.fromEntries(requisites),
  }
}
