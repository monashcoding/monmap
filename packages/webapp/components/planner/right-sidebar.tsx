"use client"

import {
  BookOpenTextIcon,
  EyeIcon,
  EyeOffIcon,
  PanelRightOpenIcon,
  XIcon,
} from "lucide-react"
import { useMemo, useState } from "react"

import { useIsMobile } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { summarizePlan } from "@/lib/planner/progress"
import { cn } from "@/lib/utils"

import { AoSTemplates } from "./aos-templates"
import { CoursePicker } from "./course-picker"
import { usePlanner } from "./planner-context"
import { RequirementsPanel } from "./requirements-panel"
import { UnitSearchPanel } from "./unit-search-panel"
import { useWam } from "./wam-context"

const FLAT = "rounded-none border-0 shadow-none"

type RightTab = "progress" | "add"

/**
 * Right column carrying the course picker, progress gauge, requirements
 * panel and the "Add units" search/templates. On mobile the column is
 * hidden and a floating button opens this content in a bottom Sheet.
 */
export function RightSidebar() {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState<RightTab>("progress")
  const [sheetOpen, setSheetOpen] = useState(false)

  if (isMobile) {
    return (
      <MobileRightDrawer
        tab={tab}
        onTabChange={setTab}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    )
  }

  return (
    <aside className="flex flex-col gap-4 print:hidden">
      <RightPanel tab={tab} onTabChange={setTab} />
    </aside>
  )
}

function MobileRightDrawer({
  tab,
  onTabChange,
  open,
  onOpenChange,
}: {
  tab: RightTab
  onTabChange: (t: RightTab) => void
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        render={
          <Button
            variant="default"
            className="fixed right-4 bottom-4 z-30 flex h-12 items-center gap-2 rounded-full px-4 shadow-xl md:hidden print:hidden"
            aria-label="Open course & progress panel"
          />
        }
      >
        <PanelRightOpenIcon className="size-4" />
        <span className="text-sm font-semibold">
          {tab === "progress" ? "Progress" : "Add units"}
        </span>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="h-[85svh] gap-0 p-0"
        showCloseButton={false}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Course progress &amp; add units</SheetTitle>
          <SheetDescription>
            Switch between progress summary and unit search.
          </SheetDescription>
        </SheetHeader>
        <div className="flex h-full flex-col">
          <div className="relative flex shrink-0 items-center justify-center border-b bg-card px-4 pt-3 pb-2.5">
            <span
              aria-hidden
              className="absolute top-1.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/30"
            />
            <h2 className="text-sm font-semibold">
              {tab === "progress" ? "Progress" : "Add units"}
            </h2>
            <SheetClose
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close panel"
                  className="absolute top-1/2 right-3 -translate-y-1/2"
                />
              }
            >
              <XIcon className="size-4" />
            </SheetClose>
          </div>
          <RightPanel
            tab={tab}
            onTabChange={onTabChange}
            className="flex-1 overflow-y-auto"
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function RightPanel({
  tab,
  onTabChange,
  className,
}: {
  tab: RightTab
  onTabChange: (t: RightTab) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "overflow-hidden border bg-card md:rounded-3xl md:shadow-card",
        className
      )}
    >
      {/* Tab bar */}
      <div className="sticky top-0 z-10 flex border-b bg-card">
        <TabButton
          active={tab === "progress"}
          onClick={() => onTabChange("progress")}
          icon={<BookOpenTextIcon className="size-3.5" />}
          label="Progress"
        />
        <TabButton
          active={tab === "add"}
          onClick={() => onTabChange("add")}
          label="Add units"
        />
      </div>
      {tab === "progress" ? <ProgressTab /> : <AddUnitsTab />}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px flex flex-1 items-center justify-center gap-1.5 border-b-[3px] px-4 pt-2.5 pb-2.5 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function ProgressTab() {
  const { state, course, units, offerings } = usePlanner()
  const { wam } = useWam()

  const summary = useMemo(
    () => summarizePlan(state, course, units, offerings),
    [state, course, units, offerings]
  )

  const pct =
    summary.targetCreditPoints > 0
      ? Math.min(
          100,
          Math.round(
            (summary.totalCreditPoints / summary.targetCreditPoints) * 100
          )
        )
      : 0

  return (
    <div className="flex flex-col divide-y">
      <CoursePicker className={FLAT} />
      <div className="flex flex-col items-center gap-3 px-4 py-5">
        <CircularGauge pct={pct} />
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
          <GaugeStat
            label="Credit points"
            value={`${summary.totalCreditPoints} / ${summary.targetCreditPoints}`}
          />
          <GaugeStat label="Units" value={String(summary.uniqueUnitCount)} />
          {wam !== null ? (
            <GaugeStat label="WAM" value={wam.toFixed(3)} hidable />
          ) : null}
        </div>
      </div>
      <RequirementsPanel className={FLAT} />
    </div>
  )
}

function AddUnitsTab() {
  return (
    <div className="flex flex-col divide-y">
      <UnitSearchPanel />
      <AoSTemplates className={FLAT} />
    </div>
  )
}

function GaugeStat({
  label,
  value,
  hidable = false,
}: {
  label: string
  value: string
  /** When true, render an inline eye toggle that masks the value. */
  hidable?: boolean
}) {
  const [hidden, setHidden] = useState(false)
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-1">
        <span className="text-[9px] tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        {hidable ? (
          <button
            type="button"
            onClick={() => setHidden((v) => !v)}
            aria-label={hidden ? `Show ${label}` : `Hide ${label}`}
            className="rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            {hidden ? (
              <EyeOffIcon className="size-3" />
            ) : (
              <EyeIcon className="size-3" />
            )}
          </button>
        ) : null}
      </div>
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          hidden && "tracking-widest select-none"
        )}
      >
        {hidden ? "••••" : value}
      </span>
    </div>
  )
}

function CircularGauge({ pct }: { pct: number }) {
  const r = 60
  const cx = 80
  const cy = 80
  const strokeWidth = 12
  const circumference = 2 * Math.PI * r
  const arcLength = circumference * 0.75
  const fillLength = (Math.min(pct, 100) / 100) * arcLength

  return (
    <div className="relative">
      <svg width={160} height={160} viewBox="0 0 160 160">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          transform={`rotate(135, ${cx}, ${cy})`}
          style={{ stroke: "var(--muted)" }}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${fillLength} ${circumference}`}
          transform={`rotate(135, ${cx}, ${cy})`}
          style={{
            stroke: "var(--primary)",
            transition: "stroke-dasharray 0.5s ease-out",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums">{pct}%</span>
      </div>
    </div>
  )
}
