/**
 * Who can see every review and shadowban them: the emails in
 * `REVIEW_ADMIN_EMAILS` (comma-separated, root `.env`). Without the
 * variable, the MAC projects account is the only admin.
 */
const DEFAULT_ADMINS = "projects@monashcoding.com"

export function reviewAdminEmails(): Set<string> {
  const raw = process.env.REVIEW_ADMIN_EMAILS ?? DEFAULT_ADMINS
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  )
}

export function isReviewAdmin(email: string | null | undefined): boolean {
  return email != null && reviewAdminEmails().has(email.toLowerCase())
}
