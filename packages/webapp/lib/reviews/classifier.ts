/**
 * First line of moderation: classifier.dev sorts each review into a
 * fair review, abuse, spam or personal information. A review that is
 * clearly not fair is flagged, which hides it from everyone but its
 * author. Admins make the final call on the admin page.
 *
 * If classifier.dev is down, slow or rate limited, the review is
 * published unchecked and `error` says why, so admins can find it.
 *
 * Only the review text goes to classifier.dev, never who wrote it, and
 * `share_data: false` opts out of its training data.
 */

const FAIR = "fair review"
const LABELS = [
  FAIR,
  "abuse or harassment",
  "spam or off-topic",
  "personal information",
]

const INSTRUCTIONS =
  "Moderate a student's review of a university unit, course or major. " +
  "Honest criticism is a fair review, even when harsh or sweary, if it is about the unit, course, workload, assessment, organisation or the quality of teaching. " +
  "Naming lecturers, tutors or coordinators and judging their teaching is a fair review. " +
  "Personal information means phone numbers, email addresses, home addresses, social media handles, student IDs, or claims about someone's private life, health, relationships or appearance. " +
  "Abuse means insults, threats, slurs or harassment aimed at a person or group. " +
  "Spam means advertising, links to unrelated sites, gibberish or text that is not about studying the unit or course."

/** Flag when the labels other than "fair review" add up to this. */
export const FLAG_THRESHOLD = 0.7

const TIMEOUT_MS = 5000

export type ModerationResult =
  | {
      ok: true
      flagged: boolean
      label: string
      confidence: number | null
      scores: Record<string, number>
    }
  | { ok: false; error: string }

export async function moderateReview(text: string): Promise<ModerationResult> {
  const base = process.env.CLASSIFIER_URL ?? "https://classifier.dev"
  const key = process.env.CLASSIFIER_API_KEY
  try {
    const res = await fetch(`${base}/v1/classify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-classifier-share-data": "false",
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        input: text,
        labels: LABELS,
        instructions: INSTRUCTIONS,
        share_data: false,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data = (await res.json()) as {
      results?: {
        label?: string
        confidence?: number | null
        scores?: Record<string, number>
      }[]
    }
    const result = data.results?.[0]
    const scores = result?.scores
    if (!result?.label || !scores || typeof scores[FAIR] !== "number") {
      return { ok: false, error: "Unexpected response" }
    }
    return {
      ok: true,
      flagged: 1 - scores[FAIR] >= FLAG_THRESHOLD,
      label: result.label,
      confidence: result.confidence ?? null,
      scores,
    }
  } catch (e) {
    const name = e instanceof Error ? e.name : ""
    return {
      ok: false,
      error: name === "TimeoutError" ? "Timed out" : "Request failed",
    }
  }
}
