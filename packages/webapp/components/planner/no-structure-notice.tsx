"use client"

import { ExternalLinkIcon } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { entityHref, monashHandbookUrl } from "@/lib/handbook/links"
import type { PlannerCourseWithAoS } from "@/lib/planner/types"
import { cn } from "@/lib/utils"

import { usePlanner } from "./planner-context"

/** True when the handbook gives the course something to plan against. */
export function courseHasStructure(course: PlannerCourseWithAoS): boolean {
  return (
    course.courseRequirements.length > 0 ||
    course.areasOfStudy.length > 0 ||
    course.componentCourses.length > 0
  )
}

/**
 * Shown in place of requirements for a course the handbook publishes no
 * structure for (a degree Monash is still writing, or a Monash College
 * diploma). The planner still works; there is just nothing to check
 * progress against. Points to the handbook page, and to the latest
 * earlier year with a structure when there is one.
 */
export function NoStructureNotice({
  course,
}: {
  course: PlannerCourseWithAoS
}) {
  const { courses } = usePlanner()
  const structureYear = courses.find(
    (c) => c.code === course.code
  )?.structureYear

  return (
    <div className="flex flex-col gap-3 px-4 py-5 text-xs">
      <p className="text-muted-foreground">
        Monash hasn&apos;t published the structure for{" "}
        <span className="font-semibold text-foreground">{course.code}</span> in{" "}
        {course.year} yet. You can still plan your units; there just aren&apos;t
        any requirements to check them against.
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href={monashHandbookUrl("course", course.code, course.year)}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <ExternalLinkIcon />
          Handbook page
        </a>
        {structureYear ? (
          <a
            href={entityHref("course", course.code, structureYear)}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            <ExternalLinkIcon />
            See the {structureYear} structure
          </a>
        ) : null}
      </div>
    </div>
  )
}
