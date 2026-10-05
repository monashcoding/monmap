/**
 * "March 2026". Formatted in UTC so the server's HTML and the browser
 * agree, whatever the visitor's time zone.
 */
const MONTH_YEAR = new Intl.DateTimeFormat("en-AU", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

export function reviewDate(iso: string): string {
  return MONTH_YEAR.format(new Date(iso))
}

export function reviewCount(n: number): string {
  return `${n.toLocaleString("en-AU")} ${n === 1 ? "review" : "reviews"}`
}
