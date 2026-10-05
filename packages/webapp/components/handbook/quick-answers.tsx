import Link from "next/link"
import { MessageCircleQuestionIcon } from "lucide-react"

import { entityHref } from "@/lib/handbook/links"
import type { QA, Seg } from "@/lib/handbook/summary"

import { Section } from "./frame"

/**
 * Words with links: unit codes link when MonMap has a page for them;
 * courses and areas of study always do.
 */
export function SegText({
  segs,
  linkYear,
  linkableUnits,
}: {
  segs: Seg[]
  linkYear: string | null
  linkableUnits?: ReadonlySet<string>
}) {
  return (
    <>
      {segs.map((s, i) => {
        if (typeof s === "string") return <span key={i}>{s}</span>
        const label = s.text ?? s.code
        const linkable =
          s.kind !== "unit" || !linkableUnits || linkableUnits.has(s.code)
        if (!linkable) return <span key={i}>{label}</span>
        return (
          <Link
            key={i}
            href={entityHref(
              s.kind,
              s.code,
              s.kind === "unit" ? linkYear : null
            )}
            className="font-medium text-info-foreground underline-offset-2 hover:underline"
          >
            {label}
          </Link>
        )
      })}
    </>
  )
}

/**
 * "Common questions": the questions students search for about this
 * unit, course or area of study, answered from MonMap's data.
 */
export function QuickAnswers({
  items,
  linkYear,
  linkableUnits,
}: {
  items: QA[]
  linkYear: string | null
  linkableUnits?: ReadonlySet<string>
}) {
  if (items.length === 0) return null
  return (
    <Section id="faq" title="Common questions" icon={MessageCircleQuestionIcon}>
      <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
        {items.map((q) => (
          <div key={q.id} className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold">{q.question}</h3>
            <p className="text-sm leading-relaxed text-foreground/85">
              <SegText
                segs={q.answer}
                linkYear={linkYear}
                linkableUnits={linkableUnits}
              />
            </p>
          </div>
        ))}
      </div>
    </Section>
  )
}
