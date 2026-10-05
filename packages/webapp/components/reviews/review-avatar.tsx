import Avatar from "boring-avatars"

import { cn } from "@/lib/utils"

/** MAC yellow and charcoal, with an amber and two neutrals. */
const PALETTE = ["#252525", "#ffe330", "#f5b000", "#d9d7d0", "#f5f5f2"]

/**
 * A reviewer's avatar, drawn by boring-avatars from their initials
 * alone, so it carries nothing more about them than the initials do.
 * Everyone with the same initials gets the same avatar.
 */
export function ReviewAvatar({
  initials,
  size = 36,
  className,
}: {
  initials: string
  size?: number
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 rounded-full", className)}
      style={{ width: size, height: size }}
    >
      {/* A size-* class keeps parents that size bare svgs (menu items)
          from shrinking it. */}
      <Avatar
        name={initials}
        variant="beam"
        colors={PALETTE}
        size={size}
        className="size-full"
      />
    </span>
  )
}
