import { test } from "node:test"
import assert from "node:assert/strict"

import {
  assessments,
  awardTitles,
  contactList,
  contactRoles,
  courseModes,
  duration,
  html,
  labels,
  learningActivities,
  learningOutcomes,
  learningResources,
  teachingApproaches,
  text,
} from "./raw.ts"

// A contact as CourseLoop stores it (2022 AHT3882): the name sits next
// to the email, phone and a `display_details` block. Names here are
// made up.
const contact = (name: string, extra: Record<string, unknown> = {}) => ({
  display_name: name,
  contact_email: `${name.replace(/ /g, ".")}@monash.edu`,
  contact_phone: "+61 3 9905 0000",
  display_details: `<p>${name}<br/>Email: x@monash.edu</p>`,
  user: { key: "u1", cl_id: "abc", value: name },
  ...extra,
})

test("contactRoles keeps names and never outputs email, phone or details", () => {
  const roles = contactRoles([
    { role: { label: "Chief examiner(s)" }, contacts: [contact("Sam Lee")] },
  ])
  assert.deepEqual(roles, [{ role: "Chief examiner(s)", names: ["Sam Lee"] }])
  const out = JSON.stringify(roles)
  for (const leak of ["@", "+61", "Email", "<p>"]) {
    assert.ok(!out.includes(leak), `leaked ${leak}`)
  }
})

test("contactRoles falls back to contact_name, then the user reference", () => {
  const roles = contactRoles([
    {
      role: "Coordinator",
      contacts: [
        { contact_name: "Ana Diaz", contact_email: "a@monash.edu" },
        { user: { key: "u2", cl_id: "def", value: "Kim Ng" } },
      ],
    },
  ])
  assert.deepEqual(roles, [
    { role: "Coordinator", names: ["Ana Diaz", "Kim Ng"] },
  ])
})

test("contactRoles dedupes names and drops roles with no names", () => {
  const roles = contactRoles([
    { role: "Examiner", contacts: [contact("Sam Lee"), contact("Sam Lee")] },
    { role: "Empty", contacts: [{ contact_email: "only@monash.edu" }] },
    { contacts: [contact("Jo Park")] },
    "junk",
  ])
  assert.deepEqual(roles, [
    { role: "Examiner", names: ["Sam Lee"] },
    { role: "Contacts", names: ["Jo Park"] },
  ])
})

test("contactList is one role named by the first contact", () => {
  assert.deepEqual(
    contactList(
      [
        contact("Sam Lee", { display_role_plural: "Coordinators" }),
        contact("Jo Park"),
      ],
      "Coordinator"
    ),
    [{ role: "Coordinators", names: ["Sam Lee", "Jo Park"] }]
  )
  assert.deepEqual(contactList([contact("Sam Lee")], "Coordinator"), [
    { role: "Coordinator", names: ["Sam Lee"] },
  ])
  assert.deepEqual(contactList([], "Coordinator"), [])
  assert.ok(
    !JSON.stringify(contactList([contact("Sam Lee")], "C")).includes("@")
  )
})

test("text reads scalars and both CourseLoop reference shapes", () => {
  assert.equal(text("  Clayton "), "Clayton")
  assert.equal(text(""), null)
  assert.equal(text(6), "6")
  assert.equal(text({ label: "On-campus", value: "ON" }), "On-campus")
  assert.equal(text({ key: "k", cl_id: "c", value: "S1-01" }), "S1-01")
  assert.equal(text(null), null)
  assert.equal(text(["a"]), null)
})

test("html is null when there is no visible text", () => {
  assert.equal(html("<p>&nbsp;</p>"), null)
  assert.equal(html("<p> </p>"), null)
  assert.equal(html("   "), null)
  assert.equal(html(5), null)
  assert.equal(html("<p>Hi</p>"), "<p>Hi</p>")
})

test("html sanitizes what it returns", () => {
  assert.equal(
    html(`<p onclick="x()">Hi<script>alert(1)</script></p>`),
    "<p>Hi</p>"
  )
  assert.equal(html(`<script>alert(1)</script>`), null)
})

test("assessments strip a number prefix and sort by number", () => {
  assert.deepEqual(
    assessments([
      { number: "2", assessment_name: "2 - Final exam", weight: "60" },
      {
        number: "1",
        assessment_name: "1 - Assignment",
        assessment_type: { label: "Assignment" },
        weight: "40",
        hurdle_type: "Hurdle",
      },
      { name: "Quiz" },
    ]),
    [
      { name: "Assignment", type: "Assignment", weight: 40, hurdle: "Hurdle" },
      { name: "Final exam", type: null, weight: 60, hurdle: null },
      { name: "Quiz", type: null, weight: null, hurdle: null },
    ]
  )
})

test("learningOutcomes drop empty ones and sort by number", () => {
  assert.deepEqual(
    learningOutcomes([
      { number: "2", code: "LO2", description: "<p>Two</p>" },
      { number: "3", description: "<p> </p>" },
      { order: "1", description: "<p>One</p>" },
    ]),
    [
      { code: null, html: "<p>One</p>" },
      { code: "LO2", html: "<p>Two</p>" },
    ]
  )
})

test("activities, resources and teaching approaches", () => {
  assert.deepEqual(
    learningActivities([
      {
        activity_type: "Workshop",
        activities: [{ duration_display: "2 hours" }, { activity_type: "Lab" }],
      },
    ]),
    [
      { type: "Workshop", duration: "2 hours" },
      { type: "Lab", duration: null },
    ]
  )
  assert.deepEqual(
    learningResources([
      {
        order: "2",
        type: "Recommended",
        resources: [{ description: "<p>B</p>" }],
      },
      {
        order: "1",
        type: "Required",
        resources: [{ description: "<p>A</p>" }],
      },
      { type: "Empty", resources: [] },
    ]),
    [
      { type: "Required", items: ["<p>A</p>"] },
      { type: "Recommended", items: ["<p>B</p>"] },
    ]
  )
  assert.deepEqual(
    teachingApproaches([
      { type: "Active learning", description: "<p>Do</p>" },
      { description: "<p>No label</p>" },
    ]),
    [{ label: "Active learning", html: "<p>Do</p>" }]
  )
})

test("course readers", () => {
  assert.deepEqual(
    labels([{ label: "Clayton" }, { label: "None" }, "Online"]),
    ["Clayton"]
  )
  assert.equal(duration([{ duration_display: "3 Years" }]), "3 Years")
  assert.equal(duration([]), null)
  assert.deepEqual(
    courseModes([
      {
        mode: { label: "On-campus" },
        locations: [{ label: "Clayton" }, "Malaysia"],
      },
      { locations: ["Nowhere"] },
    ]),
    [{ mode: "On-campus", locations: ["Clayton", "Malaysia"] }]
  )
  assert.deepEqual(
    awardTitles([
      { award_title: "Bachelor of IT" },
      { award_title: "Bachelor of IT " },
      {},
    ]),
    ["Bachelor of IT"]
  )
})

test("every reader returns empty output for odd input", () => {
  for (const odd of [null, undefined, "x", 5, {}, [null, 1, "a"]]) {
    assert.deepEqual(contactRoles(odd), [])
    assert.deepEqual(assessments(odd), [])
    assert.deepEqual(learningOutcomes(odd), [])
    assert.deepEqual(learningActivities(odd), [])
    assert.deepEqual(courseModes(odd), [])
  }
})
