/**
 * Tap areas for the planner's 20-24px icon buttons. Below md each one
 * gets an invisible ::after that grows its hit area to about 40px; at
 * md and up nothing changes.
 */

/** A button with room around it: 8px on every side. */
export const TOUCH_HIT =
  "relative after:absolute after:-inset-2 md:after:hidden"

/**
 * A button in a row of buttons: 8px above and below, 4px to the sides,
 * so neighbours 8px apart don't steal each other's taps.
 */
export const TOUCH_HIT_ROW =
  "relative after:absolute after:-inset-x-1 after:-inset-y-2 md:after:hidden"
