/**
 * The initials shown on a review, from the author's name. They are the
 * only thing about the author that leaves the server.
 *
 * - "Alex Chen" → "AC", "Cher" → "C", "Mary Jane van der Berg" → "MB"
 * - With no usable name, the email's local part: "jordan.lee99@x" → "JL".
 * - With nothing usable at all, "?".
 */
export function reviewInitials(
  name: string | null | undefined,
  email?: string | null
): string {
  const fromName = initialsOf(name && !name.includes("@") ? name : "")
  if (fromName) return fromName
  const local = (email ?? name ?? "").split("@")[0] ?? ""
  return initialsOf(local.replace(/[._\-+\d]+/g, " ")) || "?"
}

function initialsOf(text: string): string {
  const words = text
    .split(/\s+/)
    .map((w) => w.match(/\p{L}/u)?.[0])
    .filter((c): c is string => c != null)
  if (words.length === 0) return ""
  const picked = words.length === 1 ? [words[0]] : [words[0], words.at(-1)!]
  return picked.join("").toLocaleUpperCase()
}
