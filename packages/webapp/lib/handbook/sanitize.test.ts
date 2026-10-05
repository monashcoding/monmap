import { test } from "node:test"
import assert from "node:assert/strict"

import { rewriteHandbookHtml } from "./links.ts"
import { safeHref, sanitizeHandbookHtml as clean } from "./sanitize.ts"

test("the prose tags the handbook uses pass through unchanged", () => {
  const html =
    "<p>You must <strong>complete</strong> <em>one</em> of:</p><ul><li>FIT1045</li><li>FIT1053<br>(advanced)</li></ul><ol><li>x</li></ol><div><blockquote>q</blockquote></div>"
  assert.equal(clean(html), html)
})

test("script-like elements go with their content", () => {
  assert.equal(clean("<p>a<script>alert(1)</script>b</p>"), "<p>ab</p>")
  assert.equal(clean("<style>p{color:red}</style>ok"), "ok")
  assert.equal(clean('<iframe src="https://x"></iframe>ok'), "ok")
  assert.equal(clean("<object data=x><p>fallback</p></object>ok"), "ok")
  assert.equal(clean('<embed src="x.swf">ok'), "ok")
  assert.equal(clean("<SCRIPT>alert(1)</SCRIPT >ok"), "ok")
  assert.equal(clean("<svg><script>alert(1)</script></svg>ok"), "ok")
  // An unclosed script drops the rest rather than leaking it.
  assert.equal(clean("ok<script>alert(1)"), "ok")
})

test("event handlers, styles and other attributes are stripped", () => {
  assert.equal(clean("<img src=x onerror=alert(1)>"), "")
  assert.equal(
    clean('<p onclick="alert(1)" style="color:red" class="x">hi</p>'),
    "<p>hi</p>"
  )
  assert.equal(clean('<div onmouseover="alert(1)">x</div>'), "<div>x</div>")
  assert.equal(clean("<a onmouseover='alert(1)'>x</a>"), "<a>x</a>")
})

test("only http, https, mailto and relative links keep their href", () => {
  assert.equal(clean('<a href="javascript:alert(1)">x</a>'), "<a>x</a>")
  assert.equal(clean("<a href=javascript:alert(1)>x</a>"), "<a>x</a>")
  assert.equal(clean("<a href='JavaScript:alert(1)'>x</a>"), "<a>x</a>")
  assert.equal(clean('<a href="java\tscript:alert(1)">x</a>'), "<a>x</a>")
  assert.equal(clean('<a href=" javascript:alert(1)">x</a>'), "<a>x</a>")
  assert.equal(clean('<a href="jav&#x61;script:alert(1)">x</a>'), "<a>x</a>")
  assert.equal(clean('<a href="javascript&colon;alert(1)">x</a>'), "<a>x</a>")
  assert.equal(clean('<a href="data:text/html,<b>x</b>">x</a>'), "<a>x</a>")
  assert.equal(clean('<a href="vbscript:x">x</a>'), "<a>x</a>")
  assert.equal(clean('<a href="//evil.example">x</a>'), "<a>x</a>")
  assert.equal(
    clean('<a href="https://www.monash.edu/it?a=1&amp;b=2">x</a>'),
    '<a href="https://www.monash.edu/it?a=1&amp;b=2">x</a>'
  )
  assert.equal(
    clean('<a href="mailto:a@monash.edu">x</a>'),
    '<a href="mailto:a@monash.edu">x</a>'
  )
  assert.equal(
    clean('<a href="/units/FIT1045">x</a>'),
    '<a href="/units/FIT1045">x</a>'
  )
  assert.equal(clean('<a href="#part-a">x</a>'), '<a href="#part-a">x</a>')
  assert.equal(safeHref("HTTPS://x.example"), "HTTPS://x.example")
  assert.equal(safeHref("   "), null)
})

test("backslash protocol-relative links are dropped", () => {
  // Browsers read `\` as `/`, so each of these leaves the site.
  assert.equal(safeHref("/\\evil.example/x"), null)
  assert.equal(safeHref("\\\\evil.example"), null)
  assert.equal(safeHref("\\/evil.example"), null)
  assert.equal(safeHref("/&#92;evil.example"), null)
  assert.equal(clean('<a href="/\\evil.example">x</a>'), "<a>x</a>")
  // A web URL with a backslash still opens as an external link.
  assert.equal(
    rewriteHandbookHtml('<a href="https:/\\evil.example">x</a>', null),
    '<a href="https:/\\evil.example" target="_blank" rel="noopener noreferrer">x</a>'
  )
})

test("a quote inside a link cannot break out of the attribute", () => {
  assert.equal(
    clean(`<a href='mailto:x" onclick="alert(1)'>x</a>`),
    '<a href="mailto:x&quot; onclick=&quot;alert(1)">x</a>'
  )
  assert.equal(
    clean(`<a href='https://x.example/"><script>alert(1)</script>'>x</a>`),
    '<a href="https://x.example/&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;">x</a>'
  )
})

test("stray angle brackets and broken tags become text", () => {
  assert.equal(clean("a < b > c"), "a &lt; b &gt; c")
  assert.equal(clean("<scr<script>ipt>alert(1)</script>"), "&lt;scr")
  assert.equal(clean('<a href="x" onclick="y"'), '&lt;a href="x" onclick="y"')
  assert.equal(clean("<!-- <script>alert(1)</script> -->ok"), "ok")
  assert.equal(clean("<!DOCTYPE html>ok"), "ok")
  assert.equal(clean("&amp; &nbsp; & AT&T"), "&amp; &nbsp; &amp; AT&amp;T")
})

test("unknown tags are dropped and their text kept", () => {
  assert.equal(clean("<h2>Title</h2><u>under</u>"), "Titleunder")
  assert.equal(clean("<h3>Title</h3>"), "<h3>Title</h3>")
})

test("unclosed tags are closed and stray closing tags dropped", () => {
  assert.equal(clean("<p><strong>bold"), "<p><strong>bold</strong></p>")
  assert.equal(clean("</div>text</p>"), "text")
  assert.equal(clean("<ul><li>a</ul>"), "<ul><li>a</li></ul>")
})

test("table cells keep numeric colspan and rowspan only", () => {
  assert.equal(
    clean(
      '<table><tr><td colspan="2" rowspan=3 width="9">x</td><th colspan="x">y</th></tr></table>'
    ),
    '<table><tr><td colspan="2" rowspan="3">x</td><th>y</th></tr></table>'
  )
})

test("empty input gives an empty string", () => {
  assert.equal(clean(null), "")
  assert.equal(clean(undefined), "")
  assert.equal(clean(""), "")
})

test("rewriteHandbookHtml sanitizes before it rewrites links", () => {
  assert.equal(
    rewriteHandbookHtml('<a href="javascript:alert(1)">x</a>', null),
    "<a>x</a>"
  )
  assert.equal(
    rewriteHandbookHtml("<a href=javascript:alert(1)>x</a>", null),
    "<a>x</a>"
  )
  assert.equal(
    rewriteHandbookHtml(`<a href='mailto:x" onclick="y'>m</a>`, null),
    '<a href="mailto:x&quot; onclick=&quot;y">m</a>'
  )
  assert.equal(rewriteHandbookHtml("<img src=x onerror=alert(1)>", null), "")
  assert.equal(
    rewriteHandbookHtml('<a href="https://x.example/a&quot;b">x</a>', null),
    '<a href="https://x.example/a&quot;b" target="_blank" rel="noopener noreferrer">x</a>'
  )
})

test("rewriteHandbookHtml is idempotent", () => {
  const once = rewriteHandbookHtml(
    '<p><a href="https://handbook.monash.edu/2024/units/FIT1045">FIT1045</a> <a href="https://www.monash.edu/it">IT</a> <a href="mailto:a@b.c">m</a></p>',
    "2025"
  )
  assert.equal(
    once,
    '<p><a href="/units/FIT1045/2025">FIT1045</a> <a href="https://www.monash.edu/it" target="_blank" rel="noopener noreferrer">IT</a> <a href="mailto:a@b.c">m</a></p>'
  )
  assert.equal(rewriteHandbookHtml(once, "2025"), once)
})

test("a long run of unclosed tags is escaped in linear time", () => {
  for (const unit of ["<a x", '<a x="', "<a x='<a y=\" ", '<a x="1" <']) {
    const html = unit.repeat(50_000)
    const start = performance.now()
    const out = clean(html)
    assert.ok(performance.now() - start < 200, `slow on ${unit}`)
    assert.ok(!out.includes("<"), `raw < on ${unit}`)
  }
})
