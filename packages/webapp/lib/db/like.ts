/**
 * LIKE/ILIKE patterns from user text. Postgres treats `%` and `_` as
 * wildcards and `\` as the escape character, so a search for "50%"
 * must not match everything. Pure, so it is tested without a database.
 */
export function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** A pattern that matches `s` anywhere in the value. */
export function containsPattern(s: string): string {
  return `%${likeEscape(s)}%`
}
