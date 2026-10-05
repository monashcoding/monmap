import { useSyncExternalStore } from "react"

const subscribeToNothing = () => () => {}

/**
 * False during SSR and on the hydrating render, true forever after.
 *
 * `getServerSnapshot` (the third argument) is what React uses both on
 * the server and while hydrating on the client, so this reports false
 * on exactly the renders that must agree with the server HTML, with no
 * effect and no extra render pass.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  )
}
