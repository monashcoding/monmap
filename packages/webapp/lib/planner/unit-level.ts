/**
 * The number in a handbook level string: 1 for "Level 1", 10 for
 * "Postgraduate Level 10". Null when there is no number. Search
 * filters, ranking, auto-fill and WAM weighting all read levels
 * through this, so they agree on what a level is.
 */
export function unitLevel(level: string | null | undefined): number | null {
  const m = level?.match(/\d+/)
  return m ? Number(m[0]) : null
}
