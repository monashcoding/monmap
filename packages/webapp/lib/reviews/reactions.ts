/**
 * The fixed set of reactions on reviews. The database stores the ids,
 * and every write checks the id against this list, so no one can react
 * with anything else (letters to spell words, for example).
 */

export const REACTIONS = [
  { id: "up", emoji: "👍", label: "Helpful" },
  { id: "down", emoji: "👎", label: "Not helpful" },
  { id: "laugh", emoji: "😂", label: "Funny" },
  { id: "sad", emoji: "😢", label: "Sad" },
  { id: "angry", emoji: "😡", label: "Angry" },
  { id: "wow", emoji: "😮", label: "Surprising" },
] as const

export type ReactionId = (typeof REACTIONS)[number]["id"]

export const REACTION_IDS: readonly ReactionId[] = REACTIONS.map((r) => r.id)

/** Reaction counts and the viewer's own reactions on one review. */
export interface ReviewReactions {
  counts: Partial<Record<ReactionId, number>>
  mine: ReactionId[]
}

export const NO_REACTIONS: ReviewReactions = { counts: {}, mine: [] }

/** Most review ids one reactions request may ask about. */
export const MAX_REACTION_IDS = 50

export function isReaction(v: unknown): v is ReactionId {
  return typeof v === "string" && (REACTION_IDS as string[]).includes(v)
}

/** "up" and "down" exclude each other; the others stand alone. */
export const OPPOSITE: Partial<Record<ReactionId, ReactionId>> = {
  up: "down",
  down: "up",
}

/**
 * The viewer's reactions after they toggle `r`: remove it if they had
 * it, else add it and drop its opposite.
 */
export function toggleReaction(
  state: ReviewReactions,
  r: ReactionId
): ReviewReactions {
  const counts = { ...state.counts }
  const bump = (id: ReactionId, by: number) => {
    const n = (counts[id] ?? 0) + by
    if (n > 0) counts[id] = n
    else delete counts[id]
  }
  if (state.mine.includes(r)) {
    bump(r, -1)
    return { counts, mine: state.mine.filter((m) => m !== r) }
  }
  const opposite = OPPOSITE[r]
  let mine = state.mine
  if (opposite && mine.includes(opposite)) {
    bump(opposite, -1)
    mine = mine.filter((m) => m !== opposite)
  }
  bump(r, 1)
  return { counts, mine: [...mine, r] }
}
