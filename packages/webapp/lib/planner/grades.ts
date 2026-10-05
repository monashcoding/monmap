export type MonashGradeCode = "HD" | "D" | "C" | "P" | "N"

export function markToGrade(mark: number): MonashGradeCode {
  if (mark >= 80) return "HD"
  if (mark >= 70) return "D"
  if (mark >= 60) return "C"
  if (mark >= 50) return "P"
  return "N"
}

export const GRADE_STYLES: Record<
  MonashGradeCode,
  { bg: string; text: string }
> = {
  HD: {
    bg: "bg-emerald-100 dark:bg-emerald-950",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  D: {
    bg: "bg-blue-100 dark:bg-blue-950",
    text: "text-blue-700 dark:text-blue-300",
  },
  C: {
    bg: "bg-yellow-100 dark:bg-yellow-950",
    text: "text-yellow-700 dark:text-yellow-300",
  },
  P: {
    bg: "bg-orange-100 dark:bg-orange-950",
    text: "text-orange-700 dark:text-orange-300",
  },
  N: {
    bg: "bg-red-100 dark:bg-red-950",
    text: "text-red-700 dark:text-red-300",
  },
}
