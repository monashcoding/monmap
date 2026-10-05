"use client"

import { LoaderCircleIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { fetchTreeDataAction } from "@/app/actions"
import { TreeGraph } from "@/components/tree/tree-graph"
import { TreeSidePanel } from "@/components/tree/tree-side-panel"
import { useTreeModel } from "@/components/tree/use-tree-model"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"
import { entityHref } from "@/lib/handbook/links"
import type { TreeGraphPayload } from "@/lib/tree/payload"

export interface GraphAosOption {
  code: string
  title: string
  kind: string
}

const ALL = "__all__"

const KIND_SHORT: Record<string, string> = {
  major: "Major",
  extended_major: "Ext major",
  specialisation: "Spec",
  minor: "Minor",
  elective: "Elective",
}

/**
 * The requisite map on a unit, course or area of study page: the same
 * graph as the plan map, read-only, drawn inside the page's section. Clicking a unit traces its chain
 * and opens its details, with a link to its page. The scroll wheel
 * scrolls the page; pinch, drag and the zoom buttons move the map.
 *
 * On a course page, `course` adds a picker that redraws the map for
 * one area of study.
 */
export function EntityGraph({
  initial,
  year,
  linkYear,
  emptyText,
  course,
}: {
  initial: TreeGraphPayload
  /** The handbook year the graph's data comes from. */
  year: string
  /** Year segment for links to unit pages; null links the latest. */
  linkYear: string | null
  emptyText: string
  course?: { code: string; aosOptions: GraphAosOption[] }
}) {
  const isMobile = useIsMobile()
  const [payload, setPayload] = useState(initial)
  const [aosCode, setAosCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState<string | null>(null)

  const courseCode = course?.code ?? null
  useEffect(() => {
    if (!courseCode || aosCode == null) return
    let cancelled = false
    void fetchTreeDataAction({
      mode: "course",
      courseCode,
      aosCode: aosCode === ALL ? null : aosCode,
      unitCode: null,
      direction: "upstream",
      year,
    }).then((data) => {
      if (cancelled) return
      setPayload(data)
      setFocused(null)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [courseCode, aosCode, year])

  const { nodes, edges, variantCounts, detail } = useTreeModel(payload, focused)
  const hasGraph = nodes.length > 1 || edges.length > 0
  const detailsHref = detail
    ? entityHref("unit", detail.node.code, linkYear)
    : undefined

  // Short graphs get a shorter canvas, so a unit with two
  // prerequisites isn't a small cluster in a large empty box. The
  // smallest still fits the unit panel that opens on a click.
  const height =
    nodes.length <= 6
      ? "h-[420px]"
      : nodes.length <= 16
        ? "h-[440px] sm:h-[500px]"
        : "h-[460px] sm:h-[600px]"

  return (
    <div className="flex flex-col gap-3">
      {course && course.aosOptions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={aosCode ?? ALL}
            onValueChange={(v) => {
              setLoading(true)
              setAosCode(String(v))
            }}
          >
            <SelectTrigger
              aria-label="Area of study to show"
              className="w-[min(360px,100%)]"
            >
              <SelectValue>
                {(value: unknown) => {
                  if (value === ALL || value == null)
                    return "Course core (no area of study)"
                  return (
                    course.aosOptions.find((a) => a.code === value)?.title ??
                    String(value)
                  )
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ALL}>
                  Course core (no area of study)
                </SelectItem>
                {course.aosOptions.map((a) => (
                  <SelectItem key={a.code} value={a.code}>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="inline-flex shrink-0 rounded-tag bg-muted px-1.5 py-0.5 text-[9px] font-bold tracking-wider whitespace-nowrap text-muted-foreground! uppercase">
                        {KIND_SHORT[a.kind] ?? "Other"}
                      </span>
                      <span className="text-[12px] whitespace-normal">
                        {a.title}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {loading ? (
            <LoaderCircleIcon
              className="size-4 animate-spin text-muted-foreground"
              aria-label="Loading"
            />
          ) : null}
        </div>
      ) : null}

      {hasGraph ? (
        <div
          className={`relative overflow-hidden rounded-control border ${height}`}
        >
          <TreeGraph
            // Remount on new data so the map fits the new layout.
            key={payload.graph.nodes.join(",")}
            nodes={nodes}
            edges={edges}
            focused={focused}
            variantCounts={variantCounts}
            onFocus={setFocused}
            fitAll
            minimap={false}
            scrollZoom={false}
            className="h-full min-h-0 rounded-none border-0 shadow-none"
          />
          {detail && !isMobile ? (
            <div className="pointer-events-none absolute inset-y-3 right-3 z-20 flex w-[min(360px,calc(100%-1.5rem))] flex-col">
              <div className="pointer-events-auto h-full">
                <TreeSidePanel
                  detail={detail}
                  year={year}
                  detailsHref={detailsHref}
                  onClose={() => setFocused(null)}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="rounded-control border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {emptyText}
        </p>
      )}

      <Sheet
        open={isMobile && detail != null}
        onOpenChange={(open) => {
          if (!open) setFocused(null)
        }}
      >
        <SheetContent
          side="bottom"
          className="gap-0 p-0 data-[side=bottom]:h-[85svh]"
          showCloseButton={false}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Unit details</SheetTitle>
            <SheetDescription>
              Requisites, offerings and enrolment rules for the selected unit.
            </SheetDescription>
          </SheetHeader>
          {detail ? (
            <div className="h-full overflow-hidden">
              <TreeSidePanel
                detail={detail}
                year={year}
                detailsHref={detailsHref}
                onClose={() => setFocused(null)}
                variant="flush"
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
