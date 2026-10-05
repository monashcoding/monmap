/**
 * Reads and writes for reviews (`review` table, see packages/db).
 *
 * Public reads select an explicit column list without `user_id`, so
 * nothing that identifies an author can reach a page, an action
 * response or the ISR cache. Every row becomes a PublicReview through
 * `toPublic`. The author's own review is read by user id and returned
 * without its status: a flagged or shadowbanned review looks published
 * to its author.
 */
import { randomBytes } from "node:crypto"

import { review, reviewAuthorBan } from "@monmap/db"
import { and, eq, gt, isNull, sql, type SQL } from "drizzle-orm"

import { getDb } from "./client.ts"
import { REVIEW_AXES, type ReviewKind } from "../reviews/axes.ts"
import type { ModerationResult } from "../reviews/classifier.ts"
import { classifierColumns, statusAfterSave } from "../reviews/moderation.ts"
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

export const PUBLIC_COLUMNS = {
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

/** The same columns as PUBLIC_COLUMNS, for raw queries on `review r`. */
const PUBLIC_SQL = sql`r.id, r.overall, r.ratings, r.body, r.year_taken,
  r.author_initials, r.created_at, r.updated_at`

/** An edit more than a minute after posting counts as an edit. */
export const EDIT_GRACE_MS = 60_000

/** The one place a review row becomes what browsers see. */
export function toPublic(r: PublicRow): PublicReview {
  return {
    id: r.id,
    overall: r.overall,
    ratings: r.ratings ?? {},
    body: r.body,
    yearTaken: r.yearTaken,
    initials: r.initials,
    createdAt: r.createdAt.toISOString(),
    edited: r.updatedAt.getTime() - r.createdAt.getTime() > EDIT_GRACE_MS,
  }
}

/** A raw row selected with PUBLIC_SQL, in PUBLIC_COLUMNS shape. */
export function fromSql(x: Record<string, unknown>): PublicRow {
  return {
    id: x.id as string,
    overall: x.overall as number,
    ratings: x.ratings as Record<string, number>,
    body: x.body as string,
    yearTaken: (x.year_taken as string | null) ?? null,
    initials: x.author_initials as string,
    createdAt: new Date(x.created_at as string | Date),
    updatedAt: new Date(x.updated_at as string | Date),
  }
}

const isPublished = eq(review.status, "published")

function forEntity(kind: ReviewKind, code: string) {
  return and(eq(review.entityKind, kind), eq(review.entityCode, code))
}

function ownReview(userId: string, kind: ReviewKind, code: string) {
  return and(eq(review.userId, userId), forEntity(kind, code))
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
    .where(and(ownReview(userId, kind, code), isNull(review.deletedAt)))
    .limit(1)
  return r ? toPublic(r) : null
}

export interface OwnReview extends PublicReview {
  kind: ReviewKind
  code: string
  /** The entity's latest handbook title. */
  title: string | null
}

/** The latest handbook title of the reviewed unit, course or AoS. */
const ENTITY_TITLE = sql`CASE r.entity_kind
  WHEN 'unit' THEN (SELECT title FROM units WHERE code = r.entity_code ORDER BY year DESC LIMIT 1)
  WHEN 'course' THEN (SELECT title FROM courses WHERE code = r.entity_code ORDER BY year DESC LIMIT 1)
  ELSE (SELECT title FROM areas_of_study WHERE code = r.entity_code ORDER BY year DESC LIMIT 1)
END`

/** Every review the user wrote, newest first, whatever its status. */
export async function listUserReviews(userId: string): Promise<OwnReview[]> {
  const r = await rows<Record<string, unknown>>(sql`
    SELECT ${PUBLIC_SQL}, r.entity_kind, r.entity_code,
      ${ENTITY_TITLE} AS title
    FROM review r
    WHERE r.user_id = ${userId} AND r.deleted_at IS NULL
    ORDER BY r.updated_at DESC
  `)
  return r.map((x) => ({
    ...toPublic(fromSql(x)),
    kind: x.entity_kind as ReviewKind,
    code: x.entity_code as string,
    title: (x.title as string | null) ?? null,
  }))
}

/**
 * Reviews the user created in the last 24 hours, for the daily cap.
 * Deleted hidden reviews still count.
 */
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
  moderation: ModerationResult
}

/**
 * Create or replace the user's review of one entity. `statusAfterSave`
 * decides the status from the current row, the author ban list and the
 * classifier's verdict. The current row is locked while it decides, so
 * an admin's decision made at the same moment is not lost. Writing a
 * deleted hidden review again revives it as a new review that keeps its
 * status.
 */
export async function upsertReview(w: ReviewWrite): Promise<PublicReview> {
  return getDb().transaction(async (tx) => {
    const [previous] = await tx
      .select({
        status: review.status,
        deletedAt: review.deletedAt,
        moderatedBy: review.moderatedBy,
        moderatedAt: review.moderatedAt,
      })
      .from(review)
      .where(ownReview(w.userId, w.kind, w.code))
      .for("update")
    const [ban] = await tx
      .select({ userId: reviewAuthorBan.userId })
      .from(reviewAuthorBan)
      .where(eq(reviewAuthorBan.userId, w.userId))
    const status = statusAfterSave(
      previous?.status ?? null,
      ban != null,
      w.moderation
    )
    // A hidden status kept from an admin or an earlier flag keeps its
    // history. An edit to a published review clears it, because no
    // admin has seen the new text.
    const kept =
      previous != null && previous.status === status && status !== "published"
    const now = new Date()
    const content = {
      overall: w.overall,
      ratings: w.ratings,
      body: w.body,
      yearTaken: w.yearTaken,
      authorInitials: w.initials,
      ...classifierColumns(w.moderation),
      classifiedAt: now,
      status,
    }
    const [r] = await tx
      .insert(review)
      .values({
        userId: w.userId,
        entityKind: w.kind,
        entityCode: w.code,
        ...content,
      })
      .onConflictDoUpdate({
        target: [review.userId, review.entityKind, review.entityCode],
        set: {
          ...content,
          moderatedBy: kept ? previous.moderatedBy : null,
          moderatedAt: kept ? previous.moderatedAt : null,
          deletedAt: null,
          ...(previous?.deletedAt ? { createdAt: now } : {}),
          updatedAt: now,
        },
      })
      .returning(PUBLIC_COLUMNS)
    return toPublic(r)
  })
}

/**
 * Delete the user's review of one entity. A flagged or shadowbanned
 * review is only marked deleted: it disappears for its author too, but
 * writing it again keeps its status (see upsertReview).
 */
export async function deleteUserReview(
  userId: string,
  kind: ReviewKind,
  code: string
): Promise<boolean> {
  const own = sql`user_id = ${userId} AND entity_kind = ${kind}
    AND entity_code = ${code}`
  const [r] = await rows<{ n: number }>(sql`
    WITH hidden AS (
      UPDATE review SET deleted_at = ${new Date().toISOString()}
      WHERE ${own} AND status <> 'published' AND deleted_at IS NULL
      RETURNING id
    ), gone AS (
      DELETE FROM review WHERE ${own} AND status = 'published'
      RETURNING id
    )
    SELECT (SELECT count(*) FROM hidden)::int
      + (SELECT count(*) FROM gone)::int AS n
  `)
  return (r?.n ?? 0) > 0
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
   * A tag that is the same for every review by one author, so admins can
   * spot one person posting many reviews. It is keyed with a server
   * secret, so knowing a user id is not enough to work out the tag.
   */
  authorTag: string
  /** How many reviews this author has written. */
  authorReviews: number
}

/**
 * The key for author tags: REVIEW_TAG_SECRET, or a random key per
 * process. A random key changes every tag on restart, which is fine:
 * tags only group one author's reviews on the page in front of an admin.
 */
let tagKey: string | null = null
function authorTagKey(): string {
  tagKey ??= process.env.REVIEW_TAG_SECRET || randomBytes(32).toString("hex")
  return tagKey
}

function adminWhere(filter: AdminFilter, q: string): SQL {
  // Deleted reviews are hidden from everyone, admins included.
  const parts: SQL[] = [sql`r.deleted_at IS NULL`]
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
      SELECT ${PUBLIC_SQL}, r.entity_kind, r.entity_code, r.status,
        r.classifier_label, r.classifier_confidence, r.classifier_scores,
        r.classifier_error, r.moderated_by, r.moderated_at,
        left(md5(${authorTagKey()} || ':' || r.user_id), 6) AS author_tag,
        (SELECT count(*)::int FROM review o
          WHERE o.user_id = r.user_id AND o.deleted_at IS NULL)
          AS author_reviews,
        ${ENTITY_TITLE} AS title
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
    reviews: list.map((x) => ({
      ...toPublic(fromSql(x)),
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
    })),
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
    WHERE deleted_at IS NULL
  `)
  return r
}

/** The entities whose pages change when these reviews change status. */
export interface ReviewTarget {
  kind: ReviewKind
  code: string
}

/**
 * Publish or shadowban one review. Publishing a review by a banned
 * author also lifts the ban, so their next reviews are published again.
 */
export async function setReviewStatus(
  id: string,
  status: ReviewStatus,
  adminEmail: string
): Promise<ReviewTarget[]> {
  return rows<ReviewTarget>(sql`
    WITH changed AS (
      UPDATE review SET status = ${status}, moderated_by = ${adminEmail},
        moderated_at = ${new Date().toISOString()}
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING user_id, entity_kind, entity_code
    ), unban AS (
      DELETE FROM review_author_ban
      WHERE ${status} = 'published'
        AND user_id IN (SELECT user_id FROM changed)
    )
    SELECT entity_kind AS kind, entity_code AS code FROM changed
  `)
}

/**
 * Shadowban every review by the author of review `id`, and ban the
 * author so every review they write later starts shadowbanned.
 */
export async function shadowbanAuthorOf(
  id: string,
  adminEmail: string
): Promise<ReviewTarget[]> {
  return rows<ReviewTarget>(sql`
    WITH author AS (
      SELECT user_id FROM review WHERE id = ${id}
    ), ban AS (
      INSERT INTO review_author_ban (user_id, banned_by)
      SELECT user_id, ${adminEmail} FROM author
      ON CONFLICT (user_id) DO NOTHING
    )
    UPDATE review SET status = 'shadowbanned', moderated_by = ${adminEmail},
      moderated_at = ${new Date().toISOString()}
    WHERE user_id IN (SELECT user_id FROM author)
    RETURNING entity_kind AS kind, entity_code AS code
  `)
}
