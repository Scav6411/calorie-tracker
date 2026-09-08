import { useEffect } from 'react'

/**
 * Refetches shortly after load, to catch a sync that is still in flight.
 *
 * The app is launched from a Home Screen Shortcut whose first action opens this
 * URL and whose second posts the day's Health data. So the page loads and reads
 * energy_readings while that upload is still travelling, and the first render
 * shows the PREVIOUS sync. Waiting for the user to notice and pull again is a
 * bad trade against two cheap queries.
 *
 * Fixed delays rather than polling until something changes: there is no way to
 * tell "the upload has not landed yet" from "the Shortcut did not run", and a
 * loop that cannot distinguish those would run forever on the second case.
 */
const CATCH_UP_DELAYS_MS = [2_500, 7_000]

export function useSyncCatchUp(reload: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    const timers = CATCH_UP_DELAYS_MS.map((delay) => setTimeout(reload, delay))
    return () => {
      for (const timer of timers) clearTimeout(timer)
    }
  }, [reload, enabled])
}
