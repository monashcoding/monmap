"use client"

import { SlidersHorizontalIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import { fetchTreeDataAction, loadCourseAction } from "@/app/actions"
import { AppHeader } from "@/components/app-header"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"
import { PERIOD_KIND_SHORT } from "@/lib/planner/teaching-period"
import type {
  PeriodKind,
  PlannerCourse,
  PlannerCourseWithAoS,
  PlannerOffering,
  PlannerState,
  PlannerUnit,
  RequisiteBlock,
} from "@/lib/planner/types"
import { buildEquivalence, collapseEdges } from "@/lib/tree/equivalence"
import { parseLevel } from "@/lib/tree/layout"
import type { TreeEdge, TreeGraphRaw, TreeNode } from "@/lib/tree/types"

import type { TreeControlsValue } from "@/lib/tree/payload"

import { TreeControls } from "./tree-controls"
import { TreeGraph } from "./tree-graph"
import { TreeSidePanel, type FocusedUnitDetail } from "./tree-side-panel"

export interface TreeViewProps {
  availableYears: string[]
  courses: PlannerCourse[]
  initialCourse: PlannerCourseWithAoS | null
  initial: {
    /** Initial controls state. */
    controls: TreeControlsValue
    /** Pre-fetched graph for the initial controls. */
    graph: TreeGraphRaw
    /** Hydrated unit metadata for every node. */
    units: Record<string, PlannerUnit>
    /** Offerings keyed by code. */
    offerings: Record<string, PlannerOffering[]>
    /** Requisites keyed by code. */
    requisites: Record<string, RequisiteBlock[]>
    /** Enrolment rules keyed by code. */
    enrolmentRules: Record<
      string,
      Array<{ ruleType: string | null; description: string | null }>
    >
  }
  /** Whether the user is signed in (drives can-use-plan toggle). */
  signedIn: boolean
  /** Active plan, if any — drives plan-status highlights. */
  activePlan: PlannerState | null
}

export function TreeView(props: TreeViewProps) {
  const isMobile = useIsMobile()
  const [controlsOpen, setControlsOpen] = useState(false)

  const [controls, setControls] = useState<TreeControlsValue>(
    props.initial.controls
  )
  const [course, setCourse] = useState<PlannerCourseWithAoS | null>(
    props.initialCourse
  )

  const [graph, setGraph] = useState<TreeGraphRaw>(props.initial.graph)
  const [units, setUnits] = useState<Record<string, PlannerUnit>>(
    props.initial.units
  )
  const [offerings, setOfferings] = useState<Record<string, PlannerOffering[]>>(
    props.initial.offerings
  )
  const [requisites, setRequisites] = useState<
    Record<string, RequisiteBlock[]>
  >(props.initial.requisites)
  const [enrolmentRules, setEnrolmentRules] = useState<
    Record<
      string,
      Array<{ ruleType: string | null; description: string | null }>
    >
  >(props.initial.enrolmentRules)

  const [focused, setFocused] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Single effect: refetch the graph (and the course meta when needed)
  // whenever the controls change. Pushing all setStates into the awaited
  // block keeps us out of the `set-state-in-effect` rule's crosshairs.
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const tag = setTimeout(() => {
        if (!cancelled) setLoading(true)
      }, 0)
      const wantCourseMeta = controls.mode === "course" && !!controls.courseCode
      const [data, courseMeta] = await Promise.all([
        fetchTreeDataAction(controls),
        wantCourseMeta
          ? loadCourseAction(controls.courseCode!, controls.year)
          : Promise.resolve(null),
      ])
      clearTimeout(tag)
      if (cancelled) return
      setGraph(data.graph)
      setUnits(data.units)
      setOfferings(data.offerings)
      setRequisites(data.requisites)
      setEnrolmentRules(data.enrolmentRules)
      setCourse(wantCourseMeta ? courseMeta : null)
      setLoading(false)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [controls])

  const planCompleted = useMemo<ReadonlySet<string>>(() => {
    if (!controls.useMyPlan || !props.activePlan) return new Set()
    const out = new Set<string>()
    for (const y of props.activePlan.years) {
      for (const s of y.slots) {
        for (const c of s.unitCodes) out.add(c)
      }
    }
    return out
  }, [controls.useMyPlan, props.activePlan])

  // Compute equivalence groups across the closure.
  const eq = useMemo(() => {
    const u = new Map<string, PlannerUnit | null>(
      graph.nodes.map((c) => [c, units[c] ?? null])
    )
    return buildEquivalence(graph.nodes, u, graph.edges)
  }, [graph, units])

  const canonicalNodes = useMemo(() => [...eq.groups.keys()], [eq])

  const canonicalEdges = useMemo<TreeEdge[]>(
    () => collapseEdges(graph.edges, eq.canonicalOf),
    [graph.edges, eq]
  )

  // Build the rich TreeNode array.
  const treeNodes = useMemo<TreeNode[]>(() => {
    const seedSet = new Set(graph.seeds.map((s) => eq.canonicalOf.get(s) ?? s))
    return canonicalNodes.map((code) => {
      const unit = units[code] ?? null
      const periodBadge = derivePeriodBadge(offerings[code] ?? [])
      const placed = planCompleted.has(code)
      const enrolGate =
        (enrolmentRules[code] ?? []).filter(
          (r) => r.description && r.description.trim().length > 0
        ).length > 0
      return {
        code,
        unit,
        level: parseLevel(code),
        prefix: code.slice(0, 3).toUpperCase(),
        isSeed: seedSet.has(code),
        hasEnrolmentGate: enrolGate,
        periodBadge,
        planStatus: placed ? "placed" : null,
      } satisfies TreeNode
    })
  }, [
    canonicalNodes,
    units,
    offerings,
    enrolmentRules,
    planCompleted,
    graph.seeds,
    eq,
  ])

  const variantCounts = useMemo(
    () =>
      new Map<string, number>(
        [...eq.groups.entries()].map(([k, g]) => [k, g.members.length])
      ),
    [eq]
  )

  const focusedDetail = useMemo<FocusedUnitDetail | null>(() => {
    if (!focused) return null
    const node = treeNodes.find((n) => n.code === focused)
    if (!node) return null
    const group = eq.groups.get(focused)
    const variants = group ? group.members.filter((m) => m !== focused) : []
    // Pool requisites / offerings / enrolment rules across all variant
    // members so the panel shows the union (variants are interchangeable).
    const members = group?.members ?? [focused]
    const reqs: RequisiteBlock[] = []
    const offs: PlannerOffering[] = []
    const er: Array<{
      ruleType: string | null
      description: string | null
    }> = []
    for (const m of members) {
      for (const r of requisites[m] ?? []) reqs.push(r)
      for (const o of offerings[m] ?? []) offs.push(o)
      for (const e of enrolmentRules[m] ?? []) er.push(e)
    }
    return {
      node,
      variants,
      offerings: offs,
      requisites: reqs,
      enrolmentRules: er,
      completed: planCompleted,
    }
  }, [
    focused,
    treeNodes,
    eq,
    requisites,
    offerings,
    enrolmentRules,
    planCompleted,
  ])

  const controlsNode = (
    <TreeControls
      value={controls}
      onChange={(v) => {
        setControls(v)
        if (isMobile) setControlsOpen(false)
      }}
      availableYears={props.availableYears}
      courses={props.courses}
      aosOptions={course?.areasOfStudy ?? []}
      canUsePlan={props.signedIn && props.activePlan != null}
      loading={loading}
    />
  )

  return (
    <main className="mx-auto flex min-h-svh max-w-[1500px] flex-col gap-3 px-3 pt-3 pb-6 sm:gap-5 sm:px-5 sm:pt-5 sm:pb-12">
      <AppHeader>
        <Sheet open={controlsOpen} onOpenChange={setControlsOpen}>
          <SheetTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="md:hidden"
                aria-label="Open tree controls"
              />
            }
          >
            <SlidersHorizontalIcon className="size-3.5" />
            Filters
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-[min(360px,90vw)] gap-0 overflow-y-auto p-3"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Tree controls</SheetTitle>
              <SheetDescription>
                Mode, course, unit, year and depth filters.
              </SheetDescription>
            </SheetHeader>
            {controlsNode}
          </SheetContent>
        </Sheet>
      </AppHeader>

      <div className="grid flex-1 gap-3 sm:gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="hidden lg:block">{controlsNode}</div>
        <div className="relative h-[calc(100svh-9rem)] min-h-[400px] w-full min-w-0 sm:h-[calc(100svh-7rem)] sm:min-h-[520px]">
          {treeNodes.length === 0 ? (
            <EmptyState mode={controls.mode} controls={controls} />
          ) : (
            <TreeGraph
              nodes={treeNodes}
              edges={canonicalEdges}
              focused={focused}
              variantCounts={variantCounts}
              onFocus={setFocused}
            />
          )}
          {/* Desktop: detail floats over the canvas — click a node to
              open, X or click empty pane to dismiss. Mobile: lift into
              a bottom Sheet for full-width legibility. */}
          {focusedDetail && !isMobile ? (
            <div className="pointer-events-none absolute inset-y-3 right-3 z-20 flex w-[min(380px,calc(100%-1.5rem))] flex-col">
              <div className="pointer-events-auto h-full">
                <TreeSidePanel
                  detail={focusedDetail}
                  year={controls.year}
                  onClose={() => setFocused(null)}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <Sheet
        open={isMobile && focusedDetail != null}
        onOpenChange={(v) => {
          if (!v) setFocused(null)
        }}
      >
        <SheetContent
          side="bottom"
          className="gap-0 p-0 data-[side=bottom]:h-[85svh]"
          showCloseButton={false}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Unit detail</SheetTitle>
            <SheetDescription>
              Prereqs, offerings and enrolment rules for the focused unit.
            </SheetDescription>
          </SheetHeader>
          {focusedDetail ? (
            <div className="h-full overflow-hidden">
              <TreeSidePanel
                detail={focusedDetail}
                year={controls.year}
                onClose={() => setFocused(null)}
                variant="flush"
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </main>
  )
}

function EmptyState({
  mode,
  controls,
}: {
  mode: "course" | "unit"
  controls: TreeControlsValue
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-dashed bg-card/40 p-8 text-center">
      <p className="text-sm font-medium text-foreground">
        Nothing to draw yet.
      </p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        {mode === "course"
          ? "Pick a course (and optionally a major) from the left rail. The Tree will expand its Part A spine and the chosen major's units."
          : controls.unitCode
            ? "This unit has no recorded prereqs or downstream dependants in this year. Try a different direction or a different unit."
            : "Search for a unit on the left rail to centre the tree on it."}
      </p>
    </div>
  )
}

function derivePeriodBadge(offerings: PlannerOffering[]): string | null {
  if (offerings.length === 0) return null
  const kinds = new Set<PeriodKind>()
  for (const o of offerings) kinds.add(o.periodKind)
  if (kinds.has("FULL_YEAR")) return "FY"
  const s1 = kinds.has("S1")
  const s2 = kinds.has("S2")
  if (s1 && s2) return "S1·S2"
  if (s1) return "S1"
  if (s2) return "S2"
  // Fallback to the first non-OTHER kind label.
  for (const k of kinds) {
    if (k !== "OTHER") return PERIOD_KIND_SHORT[k]
  }
  return PERIOD_KIND_SHORT.OTHER
}
