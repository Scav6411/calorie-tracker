import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchMealLogs, type MealLog } from '@/lib/meals'
import { toDayKey } from '@/lib/mock-data'

interface DayMealsState {
  logs: MealLog[]
  loading: boolean
  error: string | null
}

/** Same comparator the server uses, so an optimistic row lands in its real slot. */
const byLoggedAt = (a: MealLog, b: MealLog) =>
  a.logged_at.localeCompare(b.logged_at) || a.id.localeCompare(b.id)

/** Meals logged on one local day. */
export function useDayMeals(date: Date, enabled: boolean) {
  const [state, setState] = useState<DayMealsState>({ logs: [], loading: true, error: null })
  const dayKey = toDayKey(date)
  // Tapping through dates fires overlapping loads; without this a slow earlier
  // response can resolve last and overwrite the day actually on screen.
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const ticket = (requestId.current += 1)
    const isCurrent = () => ticket === requestId.current

    if (!enabled) {
      setState({ logs: [], loading: false, error: null })
      return
    }
    setState((previous) => ({ ...previous, loading: true, error: null }))
    try {
      const logs = await fetchMealLogs(new Date(`${dayKey}T12:00:00`))
      if (!isCurrent()) return
      setState({ logs, loading: false, error: null })
    } catch (error) {
      if (!isCurrent()) return
      setState({
        logs: [],
        loading: false,
        error: error instanceof Error ? error.message : 'Could not load meals',
      })
    }
  }, [dayKey, enabled])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  /**
   * Shows a new meal immediately, but only when it belongs to the day on
   * screen. Backdating to another day must not move today's totals; that day
   * simply loads fresh when it is next viewed.
   */
  const addLocally = useCallback(
    (log: MealLog) => {
      if (toDayKey(new Date(log.logged_at)) !== dayKey) return
      setState((previous) => ({
        ...previous,
        logs: [...previous.logs.filter((item) => item.id !== log.id), log].sort(byLoggedAt),
      }))
    },
    [dayKey],
  )

  /** Drops a deleted row without a refetch; the day's totals derive from this. */
  const removeLocally = useCallback((id: string) => {
    setState((previous) => ({
      ...previous,
      logs: previous.logs.filter((log) => log.id !== id),
    }))
  }, [])

  return { ...state, reload: load, addLocally, removeLocally }
}
