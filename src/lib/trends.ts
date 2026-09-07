import { supabase } from '@/lib/supabase'
import {
  BLOCK_DAYS,
  addDays,
  parseDayKey,
  type DailyEnergyRow,
  type DailyIntakeRow,
  type WeightEntry,
} from '@/lib/trend-math'

export * from '@/lib/trend-math'

const num = (value: unknown) => Number(value ?? 0)

/**
 * The trailing average on the first day of the window needs the six days
 * before it, so weight is always fetched with a lead-in.
 */
export function weightFetchStart(from: string) {
  return addDays(from, -(BLOCK_DAYS - 1))
}

export async function fetchDailyEnergyRange(
  from: string,
  to: string,
): Promise<DailyEnergyRow[]> {
  const { data, error } = await supabase
    .from('daily_energy')
    .select('day, total_energy')
    .gte('day', from)
    .lte('day', to)
    .order('day', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    day: row.day as string,
    total_energy: num(row.total_energy),
  }))
}

export async function fetchDailyIntakeRange(
  from: string,
  to: string,
): Promise<DailyIntakeRow[]> {
  const { data, error } = await supabase
    .from('daily_intake')
    .select('day, eaten, meal_count')
    .gte('day', from)
    .lte('day', to)
    .order('day', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    day: row.day as string,
    eaten: num(row.eaten),
    meal_count: num(row.meal_count),
  }))
}

export async function fetchWeightRange(from: string, to: string): Promise<WeightEntry[]> {
  // logged_at is a timestamp, so the upper bound is the start of the day after.
  const end = parseDayKey(addDays(to, 1))
  end.setHours(0, 0, 0, 0)
  const start = parseDayKey(from)
  start.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('weight_logs')
    .select('logged_at, weight_kg')
    .gte('logged_at', start.toISOString())
    .lt('logged_at', end.toISOString())
    .order('logged_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    logged_at: row.logged_at as string,
    weight_kg: num(row.weight_kg),
  }))
}

export async function fetchGoalWeight(): Promise<number | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('goal_weight_kg')
    .maybeSingle()

  if (error) throw new Error(error.message)
  const value = data?.goal_weight_kg
  return value == null ? null : Number(value)
}

export interface TrendsData {
  energy: DailyEnergyRow[]
  intake: DailyIntakeRow[]
  weights: WeightEntry[]
  goalWeightKg: number | null
}

/**
 * One screen, one round of requests. The three series are independent, so they
 * go out together rather than in sequence.
 */
export async function fetchTrends(from: string, to: string): Promise<TrendsData> {
  const [energy, intake, weights, goalWeightKg] = await Promise.all([
    fetchDailyEnergyRange(from, to),
    fetchDailyIntakeRange(from, to),
    fetchWeightRange(weightFetchStart(from), to),
    fetchGoalWeight(),
  ])
  return { energy, intake, weights, goalWeightKg }
}

export async function updateGoalWeight(value: number | null) {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')

  const { error } = await supabase
    .from('profiles')
    .update({ goal_weight_kg: value })
    .eq('id', auth.user.id)

  if (error) throw new Error(error.message)
}
