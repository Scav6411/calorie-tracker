import { useEffect, useState } from 'react'
import { dayKey } from '@/lib/trend-math'

/** Milliseconds until the next local midnight, with a second of slack. */
export function untilMidnight(now: Date) {
  const next = new Date(now)
  next.setHours(24, 0, 1, 0)
  return next.getTime() - now.getTime()
}

/**
 * The current local day, kept current.
 *
 * Nothing re-renders at midnight on its own - the clock is not state - so an
 * app left open overnight would keep treating yesterday as today: yesterday
 * stays excluded from the averages as "in progress", and anything logged after
 * midnight is stamped with the wrong date.
 *
 * A timer alone is not enough. Background tabs have their timers throttled,
 * and a phone that slept through the night may not fire one at all, so coming
 * back into view re-checks rather than trusting the timeout.
 */
export function useToday() {
  const [today, setToday] = useState(() => dayKey(new Date()))

  useEffect(() => {
    let timer = 0

    const sync = () => {
      // Returning the same string is a no-op, so a spurious wake-up costs
      // nothing and the common case never re-renders.
      setToday((current) => {
        const now = dayKey(new Date())
        return now === current ? current : now
      })
      timer = window.setTimeout(sync, untilMidnight(new Date()))
    }

    timer = window.setTimeout(sync, untilMidnight(new Date()))

    const onVisible = () => {
      if (document.hidden) return
      window.clearTimeout(timer)
      sync()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return today
}
