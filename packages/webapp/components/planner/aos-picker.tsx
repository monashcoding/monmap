"use client";

import { XIcon } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  PlannerAreaOfStudy,
  PlannerCourseWithAoS,
  PlannerState,
} from "@/lib/planner/types";

import { usePlanner } from "./planner-context";

/**
 * Sidebar-oriented AoS picker — one row per role, stacked. Roles hide
 * when the course doesn't offer them (e.g. a PhD has none, a BCS has
 * specialisations but no majors).
 */
export function AoSPicker() {
  const { course, state, dispatch } = usePlanner();
  if (!course) return null;

  const roles = computeRolesForCourse(course);
  if (roles.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-t pt-2">
      {roles.map((role) => (
        <RoleSelect
          key={role.role}
          label={role.label}
          options={role.options}
          current={state.selectedAos[role.role]}
          onChange={(code) => dispatch({ type: "set_aos", role: role.role, code })}
        />
      ))}
    </div>
  );
}

interface RoleDefinition {
  role: keyof PlannerState["selectedAos"];
  label: string;
  kind: PlannerAreaOfStudy["kind"];
  options: PlannerAreaOfStudy[];
}

function computeRolesForCourse(course: PlannerCourseWithAoS): RoleDefinition[] {
  const byKind = new Map<PlannerAreaOfStudy["kind"], PlannerAreaOfStudy[]>();
  for (const a of course.areasOfStudy) {
    const list = byKind.get(a.kind) ?? [];
    list.push(a);
    byKind.set(a.kind, list);
  }

  const roles: RoleDefinition[] = [];
  if ((byKind.get("major")?.length ?? 0) > 0) {
    roles.push({ role: "major", label: "Major", kind: "major", options: byKind.get("major")! });
  }
  if ((byKind.get("extended_major")?.length ?? 0) > 0) {
    roles.push({ role: "extendedMajor", label: "Extended major", kind: "extended_major", options: byKind.get("extended_major")! });
  }
  if ((byKind.get("specialisation")?.length ?? 0) > 0) {
    roles.push({ role: "specialisation", label: "Specialisation", kind: "specialisation", options: byKind.get("specialisation")! });
  }
  if ((byKind.get("minor")?.length ?? 0) > 0) {
    roles.push({ role: "minor", label: "Minor", kind: "minor", options: byKind.get("minor")! });
  }
  if ((byKind.get("elective")?.length ?? 0) > 0) {
    roles.push({ role: "elective", label: "Elective stream", kind: "elective", options: byKind.get("elective")! });
  }
  return roles;
}

function RoleSelect({
  label,
  options,
  current,
  onChange,
}: {
  label: string;
  options: PlannerAreaOfStudy[];
  current: string | undefined;
  onChange: (code: string | null) => void;
}) {
  const sorted = useMemo(
    () => [...options].sort((a, b) => a.title.localeCompare(b.title)),
    [options],
  );

  return (
    <div className="flex flex-col gap-1">
      <label className="px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-1">
        <Select
          value={current ?? ""}
          onValueChange={(v) => onChange(typeof v === "string" && v !== "" ? v : null)}
        >
          <SelectTrigger className="min-w-0 flex-1 items-center py-2.5 text-xs [&>span]:flex [&>span]:flex-1 [&>span]:items-center [&>span]:gap-2">
            <SelectValue placeholder={`Choose a ${label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent className="max-h-[320px] min-w-[320px]">
            {sorted.map((a) => (
              <SelectItem
                key={a.code}
                value={a.code}
                className="items-center py-2.5 pl-3.5 pr-12"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {a.code}
                  </span>
                  <span className="truncate">{a.title}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {current ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={() => onChange(null)}
          >
            <XIcon />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
