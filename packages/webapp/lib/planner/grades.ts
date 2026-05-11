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
  HD: { bg: "bg-emerald-100", text: "text-emerald-700" },
  D: { bg: "bg-blue-100", text: "text-blue-700" },
  C: { bg: "bg-yellow-100", text: "text-yellow-700" },
  P: { bg: "bg-orange-100", text: "text-orange-700" },
  N: { bg: "bg-red-100", text: "text-red-700" },
}
