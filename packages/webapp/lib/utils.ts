import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Teach tailwind-merge the theme's own radius roles and card shadow
// (globals.css). Without this, `cn("rounded-panel shadow-card",
// "rounded-none shadow-none")` keeps both pairs and the card's shadow
// wins, so a panel asked to sit flat still floats.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["tag", "control", "panel"],
    },
    classGroups: {
      shadow: [{ shadow: ["card"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
