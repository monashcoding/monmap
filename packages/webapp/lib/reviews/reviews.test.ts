import assert from "node:assert/strict"
import { test } from "node:test"

import { isReviewAdmin } from "./admin.ts"
import { cleanRatings, isRating, REVIEW_AXES } from "./axes.ts"
import { reviewInitials } from "./initials.ts"

test("initials come from the first and last word of the name", () => {
  assert.equal(reviewInitials("Alex Chen"), "AC")
  assert.equal(reviewInitials("mary jane van der berg"), "MB")
  assert.equal(reviewInitials("Cher"), "C")
  assert.equal(reviewInitials("  Zoë   Ñúñez "), "ZÑ")
  assert.equal(reviewInitials("(Bob) O'Brien"), "BO")
})

test("initials fall back to the email, then to ?", () => {
  assert.equal(reviewInitials(null, "jordan.lee99@student.example"), "JL")
  // A mirror row whose name is still the email.
  assert.equal(reviewInitials("sam_lee@gmail.com", "sam_lee@gmail.com"), "SL")
  assert.equal(reviewInitials("", "1234@x.com"), "?")
  assert.equal(reviewInitials(undefined, undefined), "?")
})

test("initials never contain more than two letters", () => {
  for (const name of ["A B C D", "Jean-Luc Picard", "x"]) {
    assert.ok(reviewInitials(name).length <= 2, name)
  }
})

test("ratings keep known axes with whole scores from 1 to 5", () => {
  assert.deepEqual(
    cleanRatings("unit", {
      teaching: 5,
      content: 0,
      assessment: 3.5,
      usefulness: "4",
      difficulty: 2,
      flexibility: 4,
    }),
    { teaching: 5, difficulty: 2 }
  )
  assert.deepEqual(cleanRatings("course", null), {})
  assert.ok(isRating(1) && isRating(5))
  assert.ok(!isRating(6) && !isRating(0) && !isRating(2.5))
})

test("every kind has unique axis ids and five steps on scale axes", () => {
  for (const axes of Object.values(REVIEW_AXES)) {
    const ids = axes.map((a) => a.id)
    assert.equal(new Set(ids).size, ids.length)
    for (const a of axes) {
      if (a.type === "scale") assert.equal(a.steps?.length, 5, a.id)
      assert.notEqual(a.id, "overall")
    }
  }
})

test("admins come from REVIEW_ADMIN_EMAILS, case-insensitively", () => {
  const before = process.env.REVIEW_ADMIN_EMAILS
  try {
    delete process.env.REVIEW_ADMIN_EMAILS
    assert.ok(isReviewAdmin("projects@monashcoding.com"))
    process.env.REVIEW_ADMIN_EMAILS = " A@x.com , b@y.com,"
    assert.ok(isReviewAdmin("a@X.com"))
    assert.ok(isReviewAdmin("b@y.com"))
    assert.ok(!isReviewAdmin("projects@monashcoding.com"))
    assert.ok(!isReviewAdmin(null))
    process.env.REVIEW_ADMIN_EMAILS = ""
    assert.ok(!isReviewAdmin(""))
  } finally {
    if (before === undefined) delete process.env.REVIEW_ADMIN_EMAILS
    else process.env.REVIEW_ADMIN_EMAILS = before
  }
})
