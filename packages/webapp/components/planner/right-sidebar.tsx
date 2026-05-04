"use client"

import { AnonymousBanner } from "./anonymous-banner"
import { AoSTemplates } from "./aos-templates"
import { CoursePicker } from "./course-picker"
import { RequirementsPanel } from "./requirements-panel"

/**
 * Right-side "Course Progression Guide" — mirrors MonPlan's right
 * panel. Course selection sits on top, AoS picker folds into the
 * course picker, and the progress-against-requirements tiles
 * occupy the rest of the rail.
 *
 * The anonymous-mode prompt sits above the guide so visitors see
 * "your plan is local-only" before they look at progression info.
 * It self-hides for signed-in users.
 */
export function RightSidebar() {
  return (
    <aside className="flex flex-col gap-4 print:hidden">
      <AnonymousBanner />
      <div className="relative overflow-hidden rounded-3xl border bg-[var(--monash-purple)] px-4 py-3 text-white shadow-card">
        <div
          aria-hidden
          className="absolute -top-6 -right-6 size-20 rounded-full bg-[var(--monash-yellow)] opacity-20 blur-xl"
        />
        <h2 className="relative text-sm leading-snug font-semibold">
          Course Progression Guide
        </h2>
        <p className="relative mt-0.5 text-[11px] leading-snug opacity-80">
          Pick your course and specialisations — units you add are checked
          against them.
        </p>
      </div>
      <CoursePicker />
      <AoSTemplates />
      <RequirementsPanel />
    </aside>
  )
}
