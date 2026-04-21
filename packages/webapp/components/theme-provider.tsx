"use client";

import * as React from "react";

/**
 * Light-mode-only shell. We used to route through `next-themes` to
 * support dark mode, but the product is light-only — a theme switch
 * fragments the yellow/purple palette and isn't worth the hydration
 * complexity for a single-surface app. The component is kept as a
 * trivial passthrough so layout.tsx's import doesn't churn.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
