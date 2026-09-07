import { useCallback, useEffect, useState } from 'react'
import { fetchRecentFoods, promoteRecent, type RecentFood } from '@/lib/meals'
import { demoRecentFoods } from '@/lib/demo-data'

/**
 * The "Log again" row: the user's most recently logged distinct foods.
 *
 * Deliberately NOT keyed on the day being viewed - recency is global, so
 * flicking through dates must not refetch it or flicker the strip. It changes
 * only when the user logs or deletes something.
 */
export function useRecentFoods(enabled: boolean, demo = false) {
  const [items, setItems] = useState<RecentFood[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (demo) {
      setItems(demoRecentFoods())
      setLoading(false)
      return
    }
    if (!enabled) {
      setItems([])
      setLoading(false)
      return
    }
    try {
      setItems(await fetchRecentFoods())
    } catch {
      // A failed recents fetch is not worth a toast - the strip stays empty and
      // the Log meal button still works.
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [enabled, demo])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  /**
   * Moves a just-logged food to the front. Exact, not optimistic: the new log
   * genuinely is the newest entry for that key, so an insert needs no refetch.
   */
  const promote = useCallback((entry: RecentFood) => {
    setItems((previous) => promoteRecent(previous, entry))
  }, [])

  return { items, loading, promote, reload: load }
}
