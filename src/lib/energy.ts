import { supabase } from '@/lib/supabase'
import { toDayKey } from '@/lib/mock-data'
import type { EnergyGranularity, EnergyReading } from '@/lib/energy-math'

export * from '@/lib/energy-math'

export interface DailyEnergy {
  day: string
  active_energy: number
  resting_energy: number
  total_energy: number
  last_synced_at: string
  reading_count: number
}

/** PostgREST can hand numerics back as strings; normalise before arithmetic. */
const num = (value: unknown) => Number(value ?? 0)

function localDayBounds(date: Date) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

export async function fetchDailyEnergy(date: Date): Promise<DailyEnergy | null> {
  const { data, error } = await supabase
    .from('daily_energy')
    .select('day, active_energy, resting_energy, total_energy, last_synced_at, reading_count')
    .eq('day', toDayKey(date))
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  return {
    day: data.day as string,
    active_energy: num(data.active_energy),
    resting_energy: num(data.resting_energy),
    total_energy: num(data.total_energy),
    last_synced_at: data.last_synced_at as string,
    reading_count: num(data.reading_count),
  }
}

export async function fetchReadings(date: Date): Promise<EnergyReading[]> {
  const { start, end } = localDayBounds(date)
  const { data, error } = await supabase
    .from('energy_readings')
    .select('id, synced_at, active_energy, resting_energy, total_energy, granularity, updated_at')
    .gte('synced_at', start)
    .lt('synced_at', end)
    .order('synced_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id: row.id as string,
    synced_at: row.synced_at as string,
    active_energy: num(row.active_energy),
    resting_energy: num(row.resting_energy),
    total_energy: num(row.total_energy),
    granularity: (row.granularity as EnergyGranularity | null) ?? 'cumulative',
    updated_at: (row.updated_at as string | null) ?? (row.synced_at as string),
  }))
}

