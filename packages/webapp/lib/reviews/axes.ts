/**
 * What students rate, per kind of handbook page. Shared by the server
 * (validation, averages) and the browser (the review form), so it must
 * stay free of server-only imports.
 *
 * Every review has a required `overall` star rating. The axes below are
 * optional. Star axes read "more stars is better". Scale axes describe
 * the unit rather than judge it (a hard unit isn't a bad unit), so they
 * show as a labelled 1-5 scale instead of stars.
 */

import type { EntityKind } from "../handbook/links.ts"

export type ReviewKind = EntityKind

export const REVIEW_KINDS: readonly ReviewKind[] = ["unit", "course", "aos"]

export interface ReviewAxis {
  id: string
  label: string
  /** The question the form asks for this axis. */
  hint: string
  type: "stars" | "scale"
  /** For scale axes: the word for each point, 1 to 5. */
  steps?: readonly [string, string, string, string, string]
}

const DIFFICULTY: ReviewAxis = {
  id: "difficulty",
  label: "Difficulty",
  hint: "How hard was it to do well?",
  type: "scale",
  steps: ["Very easy", "Easy", "Moderate", "Hard", "Very hard"],
}

export const REVIEW_AXES: Record<ReviewKind, ReviewAxis[]> = {
  unit: [
    {
      id: "teaching",
      label: "Teaching",
      hint: "Lectures, tutorials and how well staff explain things",
      type: "stars",
    },
    {
      id: "content",
      label: "Content",
      hint: "How interesting and well organised the material is",
      type: "stars",
    },
    {
      id: "assessment",
      label: "Assessment",
      hint: "Clear tasks, fair marking and useful feedback",
      type: "stars",
    },
    {
      id: "usefulness",
      label: "Usefulness",
      hint: "Skills and knowledge you will use later",
      type: "stars",
    },
    DIFFICULTY,
    {
      id: "workload",
      label: "Workload",
      hint: "How much time did it take each week?",
      type: "scale",
      steps: ["Very light", "Light", "Moderate", "Heavy", "Very heavy"],
    },
  ],
  course: [
    {
      id: "teaching",
      label: "Teaching",
      hint: "The quality of teaching across the course",
      type: "stars",
    },
    {
      id: "flexibility",
      label: "Flexibility",
      hint: "Choice of majors, electives and ways to study",
      type: "stars",
    },
    {
      id: "career",
      label: "Career prospects",
      hint: "How well it prepares you for work",
      type: "stars",
    },
    {
      id: "support",
      label: "Support",
      hint: "Help from staff, course advisers and admin",
      type: "stars",
    },
    {
      id: "community",
      label: "Community",
      hint: "Peers, clubs and student life",
      type: "stars",
    },
    DIFFICULTY,
  ],
  aos: [
    {
      id: "content",
      label: "Content",
      hint: "How interesting the units are as a set",
      type: "stars",
    },
    {
      id: "teaching",
      label: "Teaching",
      hint: "The quality of teaching across its units",
      type: "stars",
    },
    {
      id: "choice",
      label: "Unit choice",
      hint: "The range of units you can pick from",
      type: "stars",
    },
    {
      id: "career",
      label: "Career relevance",
      hint: "How useful it is for the work you want",
      type: "stars",
    },
    DIFFICULTY,
  ],
}

/** Labels for the 1-5 overall rating, as Google Maps shows them. */
export const OVERALL_LABELS = ["Terrible", "Poor", "Okay", "Good", "Excellent"]

export const BODY_MIN = 30
export const BODY_MAX = 2000

export function isReviewKind(v: unknown): v is ReviewKind {
  return typeof v === "string" && (REVIEW_KINDS as string[]).includes(v)
}

export function isRating(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5
}

/** Drop unknown axis ids and out-of-range scores. */
export function cleanRatings(
  kind: ReviewKind,
  raw: unknown
): Record<string, number> {
  const out: Record<string, number> = {}
  if (typeof raw !== "object" || raw === null) return out
  const given = raw as Record<string, unknown>
  for (const axis of REVIEW_AXES[kind]) {
    const v = given[axis.id]
    if (isRating(v)) out[axis.id] = v
  }
  return out
}
