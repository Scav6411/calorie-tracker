import { useCallback, useEffect, useState } from 'react'
import { fetchReadings, type EnergyReading } from '@/lib/energy'
import { generateDemoReadings } from '@/lib/demo-data'
import { toDayKey } from '@/lib/mock-data'

interface DayEnergyState {
  readings: EnergyReading[]
  loading: boolean
  error: string | null
}

const EMPTY: DayEnergyState = { readings: [], loading: true, error: null }

/** Loads the synced energy for one local day. */
export function useDayEnergy(date: Date, enabled: boolean, demo = false) {
  const [state, setState] = useState<DayEnergyState>(EMPTY)
  // Depend on the day, not the Date instance, whose identity changes each render.
  const dayKey = toDayKey(date)

  const load = useCallback(async () => {
    if (demo) {
      setState({
        readings: generateDemoReadings(new Date(`${dayKey}T12:00:00`)),
        loading: false,
        error: null,
      })
      return
    }
    if (!enabled) {
      setState({ readings: [], loading: false, error: null })
      return
    }
    setState((previous) => ({ ...previous, loading: true, error: null }))
    try {
      const readings = await fetchReadings(new Date(`${dayKey}T12:00:00`))
      setState({ readings, loading: false, error: null })
    } catch (error) {
      setState({
        readings: [],
        loading: false,
        error: error instanceof Error ? error.message : 'Could not load Health data',
      })
    }
  }, [dayKey, enabled, demo])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  return { ...state, reload: load }
}
