import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  RANGE_BUCKET,
  bucketDays,
  buildDays,
  periodBounds,
  summarisePeriod,
  weeklyProjection,
  weightSeries,
  type TrendRange,
  type TrendsData,
} from '@/lib/trends'
import { fetchTrends } from '@/lib/trends'
import { generateDemoTrends } from '@/lib/demo-data'
import { useToday } from '@/hooks/use-today'

const EMPTY: TrendsData = { energy: [], intake: [], weights: [], goalWeightKg: null }

export function useTrends(range: TrendRange, enabled: boolean, demo = false) {
  const [raw, setRaw] = useState<TrendsData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const today = useToday()
  const { from, to } = useMemo(() => periodBounds(range, today), [range, today])

  const load = useCallback(async () => {
    if (demo) {
      setRaw(generateDemoTrends(today))
      setLoading(false)
      setError(null)
      return
    }
    if (!enabled) {
      setRaw(EMPTY)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setRaw(await fetchTrends(from, to))
    } catch (cause) {
      setRaw(EMPTY)
      setError(cause instanceof Error ? cause.message : 'Could not load trends')
    } finally {
      setLoading(false)
    }
  }, [demo, enabled, from, to, today])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  const derived = useMemo(() => {
    const days = buildDays(from, to, raw.energy, raw.intake, today)
    // Weights are fetched with a lead-in, but the series is only drawn across
    // the visible window.
    const weights = weightSeries(raw.weights, from, to)
    return {
      days,
      weights,
      buckets: bucketDays(days, RANGE_BUCKET[range]),
      summary: summarisePeriod(days),
      projection: weeklyProjection(days, weights),
    }
  }, [from, to, today, range, raw])

  return {
    ...derived,
    goalWeightKg: raw.goalWeightKg,
    bucket: RANGE_BUCKET[range],
    from,
    to,
    loading,
    error,
    reload: load,
  }
}
