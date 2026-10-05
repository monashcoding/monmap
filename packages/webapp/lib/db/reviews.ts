/**
 * Reads and writes for reviews (`review` table, see packages/db).
 *
 * Public reads select an explicit column list without `user_id`, so
 * nothing that identifies an author can reach a page, an action
 * response or the ISR cache. The author's own review is read by user
 * id and returned without its status: a flagged or shadowbanned review
 * looks published to its author.
 */
import { review } from "@monmap/db"
import { and, eq, gt, sql, type SQL } from "drizzle-orm"

import { getDb } from "./client.ts"
import { REVIEW_AXES, type ReviewKind } from "../reviews/axes.ts"
import {
  type PublicReview,
  REVIEW_PAGE_SIZE,
  type RatingSummary,
  type ReviewSort,
  type ReviewSummary,
} from "../reviews/types.ts"

type ReviewStatus = (typeof review.$inferSelect)["status"]

async function rows<T>(query: SQL): Promise<T[]> {
  return (await getDb().execute(query)) as unknown as T[]
}

/* ------------------------------------------------------------------ *
 * Public reads
 * ------------------------------------------------------------------ */

export {
  NO_RATINGS,
  REVIEW_PAGE_SIZE,
  type PublicReview,
  type RatingSummary,
  type ReviewSort,
  type ReviewSummary,
} from "../reviews/types.ts"

const PUBLIC_COLUMNS = {
  id: review.id,
  overall: review.overall,
  ratings: review.ratings,
  body: review.body,
  yearTaken: review.yearTaken,
  initials: review.authorInitials,
  createdAt: review.createdAt,
  updatedAt: review.updatedAt,
}

type PublicRow = {
  id: string
  overall: number
  ratings: Record<string, number>
  body: string
  yearTaken: string | null
  initials: string
  createdAt: Date
  updatedAt: Date
}

function toPublic(r: PublicRow): PublicReview {
  return {
    id: r.id,
    overall: r.overall,
    ratings: r.ratings ?? {},
    body: r.body,
    yearTaken: r.yearTaken,
    initials: r.initials,
    createdAt: r.createdAt.toISOString(),
    // An edit more than a minute after posting counts as an edit.
    edited: r.updatedAt.getTime() - r.createdAt.getTime() > 60_000,
  }
}

const isPublished = eq(review.status, "published")

function forEntity(kind: ReviewKind, code: string) {
  return and(eq(review.entityKind, kind), eq(review.entityCode, code))
}

/** Overall rating and count for each code; codes with none are absent. */
export async function ratingSummaries(
  kind: ReviewKind,
  codes: readonly string[]
): Promise<Record<string, RatingSummary>> {
  const unique = [...new Set(codes)]
  if (unique.length === 0) return {}
  const r = await rows<{ code: string; average: string; count: number }>(sql`
    SELECT entity_code AS code, avg(overall) AS average, count(*)::int AS count
    FROM review
    WHERE status = 'published' AND entity_kind = ${kind}
      AND entity_code IN (${sql.join(
        unique.map((c) => sql`${c}`),
        sql`, `
      )})
    GROUP BY entity_code
  `)
  return Object.fromEntries(
    r.map((x) => [x.code, { average: Number(x.average), count: x.count }])
  )
}

export async function reviewSummary(
  kind: ReviewKind,
  code: string
): Promise<ReviewSummary> {
  const axes = REVIEW_AXES[kind]
  const axisColumns = axes.map(
    (a) => sql`,
      avg((ratings->>${a.id})::numeric) AS ${sql.identifier(`avg_${a.id}`)},
      count(ratings->>${a.id})::int AS ${sql.identifier(`n_${a.id}`)}`
  )
  const [r] = await rows<Record<string, string | number | null>>(sql`
    SELECT count(*)::int AS count, avg(overall) AS average,
      count(*) FILTER (WHERE overall = 1)::int AS s1,
      count(*) FILTER (WHERE overall = 2)::int AS s2,
      count(*) FILTER (WHERE overall = 3)::int AS s3,
      count(*) FILTER (WHERE overall = 4)::int AS s4,
      count(*) FILTER (WHERE overall = 5)::int AS s5
      ${sql.join(axisColumns, sql``)}
    FROM review
    WHERE status = 'published' AND entity_kind = ${kind}
      AND entity_code = ${code}
  `)
  const count = Number(r?.count ?? 0)
  const axisSummary: ReviewSummary["axes"] = {}
  for (const a of axes) {
    const n = Number(r?.[`n_${a.id}`] ?? 0)
    if (n > 0) {
      axisSummary[a.id] = { average: Number(r?.[`avg_${a.id}`]), count: n }
    }
  }
  return {
    count,
    average: count > 0 ? Number(r?.average) : null,
    distribution: [1, 2, 3, 4, 5].map((s) => Number(r?.[`s${s}`] ?? 0)) as [
      number,
      number,
      number,
      number,
      number,
    ],
    axes: axisSummary,
  }
}

export async function listPublicReviews(
  kind: ReviewKind,
  code: string,
  { sort = "recent", offset = 0, limit = REVIEW_PAGE_SIZE } = {} as {
    sort?: ReviewSort
    offset?: number
    limit?: number
  }
): Promise<PublicReview[]> {
  const order =
    sort === "highest"
      ? [sql`${review.overall} DESC`, sql`${review.createdAt} DESC`]
      : sort === "lowest"
        ? [sql`${review.overall} ASC`, sql`${review.createdAt} DESC`]
        : [sql`${review.createdAt} DESC`]
  const r = await getDb()
    .select(PUBLIC_COLUMNS)
    .from(review)
    .where(and(forEntity(kind, code), isPublished))
    .orderBy(...order)
    .offset(offset)
    .limit(limit)
  return r.map(toPublic)
}

/* ------------------------------------------------------------------ *
 * The author's own reviews
 * ------------------------------------------------------------------ */

export async function getUserReview(
  userId: string,
  kind: ReviewKind,
  code: string
): Promise<PublicReview | null> {
  const [r] = await getDb()
    .select(PUBLIC_COLUMNS)
    .from(review)
    .where(and(eq(review.userId, userId), forEntity(kind, code)))
    .limit(1)
  return r ? toPublic(r) : null
}

export interface OwnReview extends PublicReview {
  kind: ReviewKind
  code: string
}

/** Every review the user wrote, newest first, whatever its status. */
export async function listUserReviews(userId: string): Promise<OwnReview[]> {
  const r = await getDb()
    .select({
      ...PUBLIC_COLUMNS,
      kind: review.entityKind,
      code: review.entityCode,
    })
    .from(review)
    .where(eq(review.userId, userId))
    .orderBy(sql`${review.updatedAt} DESC`)
  return r.map((x) => ({ ...toPublic(x), kind: x.kind, code: x.code }))
}

/** Reviews the user created in the last 24 hours, for the daily cap. */
export async function countRecentReviews(userId: string): Promise<number> {
  const [r] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(review)
    .where(
      and(
        eq(review.userId, userId),
        gt(review.createdAt, sql`now() - interval '24 hours'`)
      )
    )
  return r?.n ?? 0
}

export interface ReviewWrite {
  userId: string
  kind: ReviewKind
  code: string
  overall: number
  ratings: Record<string, number>
  body: string
  yearTaken: string | null
  initials: string
  moderation:
    | {
        ok: true
        flagged: boolean
        label: string
        confidence: number | null
        scores: Record<string, number>
      }
    | { ok: false; error: string }
}

/**
 * Create or replace the user's review of one entity. The classifier's
 * verdict sets the status, except that a shadowbanned review stays
 * shadowbanned: editing must not undo an admin's decision.
 */
export async function upsertReview(w: ReviewWrite): Promise<PublicReview> {
  const m = w.moderation
  const classifierStatus: ReviewStatus =
    m.ok && m.flagged ? "flagged" : "published"
  const classifier = m.ok
    ? {
        classifierLabel: m.label,
        classifierConfidence: m.confidence,
        classifierScores: m.scores,
        classifierError: null,
      }
    : {
        classifierLabel: null,
        classifierConfidence: null,
        classifierScores: null,
        classifierError: m.error,
      }
  const content = {
    overall: w.overall,
    ratings: w.ratings,
    body: w.body,
    yearTaken: w.yearTaken,
    authorInitials: w.initials,
    ...classifier,
    classifiedAt: new Date(),
  }
  const [r] = await getDb()
    .insert(review)
    .values({
      userId: w.userId,
      entityKind: w.kind,
      entityCode: w.code,
      status: classifierStatus,
      ...content,
    })
    .onConflictDoUpdate({
      target: [review.userId, review.entityKind, review.entityCode],
      set: {
        ...content,
        status: sql`CASE WHEN ${review.status} = 'shadowbanned' THEN 'shadowbanned'::review_status ELSE ${classifierStatus}::review_status END`,
        moderatedBy: sql`CASE WHEN ${review.status} = 'shadowbanned' THEN ${review.moderatedBy} ELSE NULL END`,
        moderatedAt: sql`CASE WHEN ${review.status} = 'shadowbanned' THEN ${review.moderatedAt} ELSE NULL END`,
        updatedAt: new Date(),
      },
    })
    .returning(PUBLIC_COLUMNS)
  return toPublic(r)
}

export async function deleteUserReview(
  userId: string,
  kind: ReviewKind,
  code: string
): Promise<boolean> {
  const r = await getDb()
    .delete(review)
    .where(and(eq(review.userId, userId), forEntity(kind, code)))
    .returning({ id: review.id })
  return r.length > 0
}

/* ------------------------------------------------------------------ *
 * Admin
 * ------------------------------------------------------------------ */

export type AdminFilter = "all" | ReviewStatus | "unchecked"

export const ADMIN_PAGE_SIZE = 50

export interface AdminReview extends PublicReview {
  kind: ReviewKind
  code: string
  title: string | null
  status: ReviewStatus
  classifierLabel: string | null
  classifierConfidence: number | null
  classifierScores: Record<string, number> | null
  classifierError: string | null
  moderatedBy: string | null
  moderatedAt: string | null
  /**
   * A tag that is the same for every review by one author and says
   * nothing about who they are, so admins can spot one person posting
   * many reviews.
   */
  authorTag: string
  /** How many reviews this author has written. */
  authorReviews: number
}

function adminWhere(filter: AdminFilter, q: string): SQL {
  const parts: SQL[] = [sql`TRUE`]
  if (filter === "unchecked") parts.push(sql`r.classifier_error IS NOT NULL`)
  else if (filter !== "all") parts.push(sql`r.status = ${filter}`)
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    parts.push(sql`(r.entity_code ILIKE ${like} OR r.body ILIKE ${like})`)
  }
  return sql.join(parts, sql` AND `)
}

export async function listReviewsForAdmin(
  filter: AdminFilter,
  q: string,
  offset: number
): Promise<{ reviews: AdminReview[]; total: number }> {
  const where = adminWhere(filter, q)
  const [list, [{ total }]] = await Promise.all([
    rows<Record<string, unknown>>(sql`
      SELECT r.id, r.overall, r.ratings, r.body, r.year_taken,
        r.author_initials, r.created_at, r.updated_at, r.entity_kind,
        r.entity_code, r.status, r.classifier_label,
        r.classifier_confidence, r.classifier_scores, r.classifier_error,
        r.moderated_by, r.moderated_at,
        left(md5('review-author:' || r.user_id), 6) AS author_tag,
        (SELECT count(*)::int FROM review o WHERE o.user_id = r.user_id)
          AS author_reviews,
        CASE r.entity_kind
          WHEN 'unit' THEN (SELECT title FROM units WHERE code = r.entity_code ORDER BY year DESC LIMIT 1)
          WHEN 'course' THEN (SELECT title FROM courses WHERE code = r.entity_code ORDER BY year DESC LIMIT 1)
          ELSE (SELECT title FROM areas_of_study WHERE code = r.entity_code ORDER BY year DESC LIMIT 1)
        END AS title
      FROM review r
      WHERE ${where}
      ORDER BY r.created_at DESC
      OFFSET ${offset} LIMIT ${ADMIN_PAGE_SIZE}
    `),
    rows<{ total: number }>(
      sql`SELECT count(*)::int AS total FROM review r WHERE ${where}`
    ),
  ])
  return {
    total,
    reviews: list.map((x) => {
      const created = new Date(x.created_at as string)
      const updated = new Date(x.updated_at as string)
      return {
        id: x.id as string,
        overall: x.overall as number,
        ratings: (x.ratings as Record<string, number>) ?? {},
        body: x.body as string,
        yearTaken: (x.year_taken as string | null) ?? null,
        initials: x.author_initials as string,
        createdAt: created.toISOString(),
        edited: updated.getTime() - created.getTime() > 60_000,
        kind: x.entity_kind as ReviewKind,
        code: x.entity_code as string,
        title: (x.title as string | null) ?? null,
        status: x.status as ReviewStatus,
        classifierLabel: (x.classifier_label as string | null) ?? null,
        classifierConfidence:
          x.classifier_confidence == null
            ? null
            : Number(x.classifier_confidence),
        classifierScores:
          (x.classifier_scores as Record<string, number> | null) ?? null,
        classifierError: (x.classifier_error as string | null) ?? null,
        moderatedBy: (x.moderated_by as string | null) ?? null,
        moderatedAt: x.moderated_at
          ? new Date(x.moderated_at as string).toISOString()
          : null,
        authorTag: x.author_tag as string,
        authorReviews: x.author_reviews as number,
      }
    }),
  }
}

export async function adminStatusCounts(): Promise<
  Record<AdminFilter, number>
> {
  const [r] = await rows<Record<AdminFilter, number>>(sql`
    SELECT count(*)::int AS "all",
      count(*) FILTER (WHERE status = 'published')::int AS published,
      count(*) FILTER (WHERE status = 'flagged')::int AS flagged,
      count(*) FILTER (WHERE status = 'shadowbanned')::int AS shadowbanned,
      count(*) FILTER (WHERE classifier_error IS NOT NULL)::int AS unchecked
    FROM review
  `)
  return r
}

/** The entities whose pages change when these reviews change status. */
export interface ReviewTarget {
  kind: ReviewKind
  code: string
}

export async function setReviewStatus(
  id: string,
  status: ReviewStatus,
  adminEmail: string
): Promise<ReviewTarget[]> {
  const r = await getDb()
    .update(review)
    .set({ status, moderatedBy: adminEmail, moderatedAt: new Date() })
    .where(eq(review.id, id))
    .returning({ kind: review.entityKind, code: review.entityCode })
  return r
}

/** Shadowban every review by the author of review `id`. */
export async function shadowbanAuthorOf(
  id: string,
  adminEmail: string
): Promise<ReviewTarget[]> {
  const author = getDb()
    .select({ userId: review.userId })
    .from(review)
    .where(eq(review.id, id))
  return getDb()
    .update(review)
    .set({
      status: "shadowbanned",
      moderatedBy: adminEmail,
      moderatedAt: new Date(),
    })
    .where(sql`${review.userId} IN (${author})`)
    .returning({ kind: review.entityKind, code: review.entityCode })
}
