"use client";

import { CheckIcon, MinusIcon } from "lucide-react";

import type {
  RequisiteContainer,
  RequisiteLeaf,
  RequisiteRule,
} from "@/lib/planner/types";
import { cn } from "@/lib/utils";

/**
 * Render an AND/OR tree. Each level prefixes a connector label so
 * students can read the rule as prose-ish:
 *   AND
 *     ├ OR
 *     │   FIT1008   (✓)
 *     │   FIT2085
 *     ├ OR
 *     │   MAT1830   (✓)
 */
export function RequisiteTreeView({
  rule,
  completed,
  isProhibition = false,
}: {
  rule: RequisiteRule | null | undefined;
  completed: ReadonlySet<string>;
  isProhibition?: boolean;
}) {
  if (!rule || rule.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No requirements listed.</p>;
  }
  return (
    <div className="flex flex-col gap-1 text-xs">
      {rule.map((c, i) => (
        <ContainerNode
          key={i}
          container={c}
          depth={0}
          completed={completed}
          isProhibition={isProhibition}
        />
      ))}
    </div>
  );
}

function ContainerNode({
  container,
  depth,
  completed,
  isProhibition,
}: {
  container: RequisiteContainer;
  depth: number;
  completed: ReadonlySet<string>;
  isProhibition: boolean;
}) {
  const connector = (container.parent_connector?.value ?? "AND").toUpperCase();
  const children = [
    ...(container.containers ?? []).map((c, i) => (
      <ContainerNode
        key={`c${i}`}
        container={c}
        depth={depth + 1}
        completed={completed}
        isProhibition={isProhibition}
      />
    )),
    ...(container.relationships ?? []).map((l, i) => (
      <LeafNode key={`l${i}`} leaf={l} completed={completed} isProhibition={isProhibition} />
    )),
  ];
  if (children.length === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        depth > 0 && "border-l border-dashed pl-3",
      )}
    >
      {children.length > 1 ? (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {connector === "OR" ? "any of" : "all of"}
        </span>
      ) : null}
      {children}
    </div>
  );
}

function LeafNode({
  leaf,
  completed,
  isProhibition,
}: {
  leaf: RequisiteLeaf;
  completed: ReadonlySet<string>;
  isProhibition: boolean;
}) {
  const taken = completed.has(leaf.academic_item_code);

  // Prohibitions invert: "taken" is a problem, not a check.
  const good = isProhibition ? !taken : taken;

  return (
    <div
      className={cn(
        "flex items-baseline gap-2 rounded-md px-2 py-1",
        good ? "text-foreground" : "text-muted-foreground",
        isProhibition && taken && "bg-destructive/10 text-destructive",
        !isProhibition && taken && "bg-emerald-500/10",
      )}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border",
          good ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-border",
        )}
        aria-hidden
      >
        {good ? <CheckIcon className="size-2.5" /> : <MinusIcon className="size-2.5" />}
      </span>
      <span className="text-xs font-semibold tabular-nums">
        {leaf.academic_item_code}
      </span>
      {leaf.academic_item_name ? (
        <span className="text-xs text-muted-foreground truncate">
          {leaf.academic_item_name}
        </span>
      ) : null}
    </div>
  );
}
