# Reviews and ratings

Students rate and review units, courses and areas of study. A review
belongs to the entity's code, not to a handbook year, so the FIT2004
page shows the same reviews in every year.

## What a review holds

- An overall rating from 1 to 5 stars (required).
- Optional ratings on the axes for its kind, defined in
  `packages/webapp/lib/reviews/axes.ts`:
  - Units: teaching, content, assessment, usefulness, difficulty,
    workload.
  - Courses: teaching, flexibility, career prospects, support,
    community, difficulty.
  - Areas of study: content, teaching, unit choice, career relevance,
    difficulty.
  Star axes read "more is better". Difficulty and workload are 1-5
  scales with words ("Easy" to "Very hard"), because a hard unit isn't
  a bad one.
- Text of 30 to 2,000 characters and an optional year taken.

Each signed-in user has one review per entity, which they can edit or
delete. A user can create at most 20 reviews in 24 hours.

## Privacy

- Reviews show the author's initials and nothing else. The server works
  out the initials from the author's name (from the central session)
  when they save, and stores them on the review.
- The avatar is a boring-avatars "beam" drawn from the initials alone,
  so it shows nothing the initials don't. Google profile photos are
  never shown.
- Public reads (`lib/db/reviews.ts`) select a fixed column list without
  `user_id`. No page, action response or cached HTML carries a user id,
  name or email.
- The admin page shows initials and an anonymous author tag (a hash of
  the user id) so admins can spot one person posting many reviews,
  without learning who they are.

## Moderation

1. On save, `lib/reviews/classifier.ts` sends the review text, and only
   the text, to classifier.dev with `share_data: false`. The labels are
   fair review, abuse or harassment, spam or off-topic, and personal
   information. The instructions tell it that harsh criticism and
   naming staff while judging their teaching are fair, and that contact
   details or claims about someone's private life are personal
   information.
2. If the labels other than "fair review" add up to 0.7 or more, the
   review is `flagged`. If classifier.dev is down, slow (5 s) or rate
   limited, the review is published and `classifier_error` records why.
3. Admins (`REVIEW_ADMIN_EMAILS`, default `projects@monashcoding.com`)
   use `/admin/reviews` to publish or shadowban reviews, or to shadowban
   every review by one author. The page opens on the flagged reviews.
   Everyone else gets a 404.

Flagged and shadowbanned reviews are shadow-hidden: their author still
sees them on the page and on `/my-reviews` as if they were published.
Editing a shadowbanned review keeps it shadowbanned.

## Where ratings show

Ratings use the Google Maps form, "4.3 ★★★★☆ (12)", and "☆☆☆☆☆ (0)"
with no reviews:

- The page hero (linking to the Reviews section), with
  `aggregateRating` and `review` JSON-LD on unit pages.
- Unit, course and area of study lists on the pages: requisite tiles,
  "After" lists, structure trees and cards.
- `/search` results.
- The planner: unit search rows (one star, compact), the unit popover,
  the course card and the map's unit panel. These load through
  `components/reviews/use-ratings.ts`, which batches every request on
  the page into one server action per kind.

## Caching

Handbook pages are ISR. Saving, deleting or moderating a review calls
`revalidatePath` for that entity's bare URL and each year's URL, so its
page updates on the next visit. Stars for other entities on a page's
lists can be up to a day old, the page `revalidate`. The visitor's own
review loads after the page, through a server action, because the
cached HTML is shared.

## Environment

- `REVIEW_ADMIN_EMAILS`: comma-separated admin emails.
- `CLASSIFIER_API_KEY` (optional): a classifier.dev workspace key for
  higher rate limits. `CLASSIFIER_URL` overrides the endpoint.
