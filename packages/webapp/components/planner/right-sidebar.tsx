"use client"

import { EyeIcon, EyeOffIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { summarizePlan } from "@/lib/planner/progress"
import { cn } from "@/lib/utils"

import { AoSTemplates } from "./aos-templates"
import { CoursePicker } from "./course-picker"
import { usePlanner } from "./planner-context"
import { RequirementsPanel } from "./requirements-panel"
import { UnitSearchPanel } from "./unit-search-panel"
import { useWam } from "./wam-context"

const FLAT = "rounded-none border-0 shadow-none"

export function RightSidebar() {
  const [tab, setTab] = useState<"progress" | "add">("progress")

  return (
    <aside className="flex flex-col gap-4 print:hidden">
      <div className="overflow-hidden rounded-3xl border bg-card shadow-card">
        {/* Tab bar */}
        <div className="flex border-b">
          <button
            type="button"
            onClick={() => setTab("progress")}
            className={cn(
              "-mb-px flex-1 border-b-[3px] px-4 pt-2.5 pb-2.5 text-sm font-medium transition-colors",
              tab === "progress"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Progress
          </button>
          <button
            type="button"
            onClick={() => setTab("add")}
            className={cn(
              "-mb-px flex-1 border-b-[3px] px-4 pt-2.5 pb-2.5 text-sm font-medium transition-colors",
              tab === "add"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Add units
          </button>
        </div>

        {tab === "progress" ? <ProgressTab /> : <AddUnitsTab />}
      </div>
    </aside>
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
        <div className="flex items-center gap-6">
          <GaugeStat
            label="Credit points"
            value={`${summary.totalCreditPoints} / ${summary.targetCreditPoints}`}
          />
          <GaugeStat label="Units" value={String(summary.uniqueUnitCount)} />
          {wam !== null ? (
            <GaugeStat label="WAM" value={wam.toFixed(2)} hidable />
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
          hidden && "select-none tracking-widest"
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
