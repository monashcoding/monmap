import { BookOpenIcon, TargetIcon, UsersIcon } from "lucide-react"

import type { ContactRole, LearningOutcome } from "@/lib/handbook/raw"

import { Prose, Section, SubHeading } from "./frame"

/** Sections that unit, course and area of study pages all have. */

export function OverviewSection({
  html,
  linkYear,
}: {
  html: string | null
  linkYear: string | null
}) {
  if (!html) return null
  return (
    <Section clamp id="overview" title="Overview" icon={BookOpenIcon}>
      <Prose html={html} linkYear={linkYear} className="text-[15px]" />
    </Section>
  )
}

export function LearningOutcomesSection({
  outcomes,
  intro,
  linkYear,
}: {
  outcomes: LearningOutcome[]
  /** A lead-in above the list, such as the handbook's own. */
  intro?: React.ReactNode
  linkYear: string | null
}) {
  if (outcomes.length === 0) return null
  return (
    <Section clamp id="outcomes" title="Learning outcomes" icon={TargetIcon}>
      {intro}
      <ol className="flex flex-col gap-3">
        {outcomes.map((o, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
              {i + 1}
            </span>
            <Prose html={o.html} linkYear={linkYear} className="pt-0.5" />
          </li>
        ))}
      </ol>
    </Section>
  )
}

export function ContactsSection({ contacts }: { contacts: ContactRole[] }) {
  if (contacts.length === 0) return null
  return (
    <Section id="contacts" title="Contacts" icon={UsersIcon}>
      <dl className="grid gap-4 sm:grid-cols-2">
        {contacts.map((c) => (
          <div key={c.role}>
            <dt className="mb-1 text-xs text-muted-foreground">
              {c.role.replace(/\(s\)$/, "s")}
            </dt>
            {c.names.map((n) => (
              <dd key={n} className="text-sm font-medium">
                {n}
              </dd>
            ))}
          </div>
        ))}
      </dl>
    </Section>
  )
}

/**
 * Titled blocks of handbook prose, as siblings for the caller's column.
 * Blocks with no text are left out.
 */
export function ProseBlocks({
  blocks,
  linkYear,
}: {
  blocks: Array<[title: string, html: string | null]>
  linkYear: string | null
}) {
  return blocks.map(([title, html]) =>
    html ? (
      <div key={title}>
        <SubHeading>{title}</SubHeading>
        <Prose html={html} linkYear={linkYear} />
      </div>
    ) : null
  )
}
