/**
 * Headings for each kind of requisite block, shared by the handbook
 * unit page and the unit detail panels. No "use client", so server
 * components can import the values.
 */
export const REQUISITE_LABEL: Record<string, { title: string; note?: string }> =
  {
    prerequisite: {
      title: "Prerequisites",
      note: "Pass these before you enrol.",
    },
    corequisite: {
      title: "Corequisites",
      note: "Pass these before, or take them in the same semester.",
    },
    prohibition: {
      title: "Prohibitions",
      note: "You can't enrol if you have passed any of these.",
    },
    permission: { title: "Permission required" },
    other: { title: "Other requirements" },
  }

export function requisiteTitle(requisiteType: string): string {
  return REQUISITE_LABEL[requisiteType]?.title ?? requisiteType
}
