import type { EnergyReading } from '@/lib/energy-math'
import { toDayKey } from '@/lib/mock-data'
import type { MealLog, MealTag, RecentFood } from '@/lib/meal-math'
import { foodKey } from '@/lib/meal-math'
import {
  KCAL_PER_KG,
  addDays,
  parseDayKey,
  type DailyEnergyRow,
  type DailyIntakeRow,
  type WeightEntry,
} from '@/lib/trend-math'
import type { TrendsData } from '@/lib/trends'

// A full synthetic day, so the home screen can be reviewed without a login or a
// phone. Only reachable from the dev-only /demo route.

/** Active kcal burned in each hour: quiet night, morning run, evening walk. */
const ACTIVE_PER_HOUR = [
  3, 2, 2, 2, 4, 12, 185, 95, 28, 32, 38, 44, 30, 48, 26, 34, 42, 66, 118, 72, 40, 26, 14, 6,
]

/** Resting burn is near constant, dipping slightly during deep sleep. */
const RESTING_PER_HOUR = [
  48, 47, 47, 47, 49, 54, 62, 60, 58, 57, 57, 58, 59, 58, 57, 57, 58, 60, 62, 61, 59, 56, 52, 50,
]


/**
 * One row per hour, matching what the Health Shortcut uploads: the burn inside
 * that hour alone, not a running total. Stops at the current hour when the
 * requested day is today, so the demo day fills in as the real one would.
 */
export function generateDemoReadings(date: Date): EnergyReading[] {
  const now = new Date()
  const isToday = toDayKey(date) === toDayKey(now)
  const lastHour = isToday ? now.getHours() : 23

  const readings: EnergyReading[] = []

  for (let hour = 0; hour <= lastHour; hour += 1) {
    const active = ACTIVE_PER_HOUR[hour]
    const resting = RESTING_PER_HOUR[hour]

    const synced = new Date(date)
    synced.setHours(hour, 0, 0, 0)

    readings.push({
      id: `demo-${hour}`,
      synced_at: synced.toISOString(),
      active_energy: active,
      resting_energy: resting,
      total_energy: active + resting,
      granularity: 'hourly',
      // The demo has no real upload behind it; the last bucket stands in, which
      // keeps the "synced ..." line moving as the day goes on.
      updated_at: synced.toISOString(),
    })
  }

  return readings
}

const DEMO_MEALS: Array<{
  tag: MealTag
  name: string
  quantity: number
  unit: string
  at: number
  kcal: number
}> = [
  { tag: 'breakfast', name: 'Oats + banana', quantity: 1, unit: 'bowl', at: 8.2, kcal: 320 },
  { tag: 'lunch', name: 'Chicken + rice bowl', quantity: 1, unit: 'bowl', at: 13.08, kcal: 540 },
  { tag: 'snack', name: 'Protein shake', quantity: 1, unit: 'scoop', at: 17.5, kcal: 160 },
  { tag: 'dinner', name: 'Roti + sabzi', quantity: 2, unit: 'plate', at: 20.6, kcal: 480 },
]

/**
 * Meals spread across the day, filtered to what has already happened today.
 * Shaped as real MealLogs so the list, the chart and the delete sheet all read
 * one type - the demo route is the only place these are not server rows.
 */
export function generateDemoMealLogs(date: Date): MealLog[] {
  const now = new Date()
  const isToday = toDayKey(date) === toDayKey(now)
  const cutoff = isToday ? now.getHours() + now.getMinutes() / 60 : 24
  const day = toDayKey(date)

  return DEMO_MEALS.filter((meal) => meal.at <= cutoff).map((meal, index) => {
    const at = new Date(date)
    at.setHours(Math.floor(meal.at), Math.round((meal.at % 1) * 60), 0, 0)
    return {
      // Keyed by day: without it, deleting Monday's entry would take Tuesday's
      // matching entry with it.
      id: `demo-meal-${day}-${index}`,
      name: meal.name,
      quantity: meal.quantity,
      unit: meal.unit,
      calories: meal.kcal,
      meal_tag: meal.tag,
      logged_at: at.toISOString(),
    }
  })
}

/** Demo has no history table, so "Log again" offers the demo day's own menu. */
export function demoRecentFoods(): RecentFood[] {
  const now = new Date().toISOString()
  return DEMO_MEALS.map((meal) => ({
    food_key: foodKey(meal.name),
    food_item_id: null,
    name: meal.name,
    quantity: meal.quantity,
    unit: meal.unit,
    calories: meal.kcal,
    meal_tag: meal.tag,
    last_logged_at: now,
  }))
}

// Module-level counter, the same precedent as sessionFoods in demo-foods.ts.
// Ids are prefixed so nothing can mistake them for a uuid and send one to
// PostgREST.
let demoLogSeq = 0

export function demoMealLog(input: Omit<MealLog, 'id'>): MealLog {
  demoLogSeq += 1
  return { id: `demo-log-${demoLogSeq}`, ...input }
}

// ---------------------------------------------------------------------------
// A year of history for the Trends page
// ---------------------------------------------------------------------------

/**
 * Deterministic noise keyed off the day, so the demo looks the same on every
 * reload and the same date reads identically at 7D and at 1Y.
 */
function pseudo(key: string, salt: number) {
  let hash = 2166136261 ^ salt
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  hash ^= hash >>> 15
  return ((hash >>> 0) % 100_000) / 100_000
}

const DEMO_SPAN_DAYS = 365
const DEMO_START_WEIGHT = 82
const DEMO_GOAL_WEIGHT = 75

/**
 * Simulates the whole year in one pass regardless of the range on screen: the
 * weight line is cumulative, so a 7D view has to agree with the 1Y view about
 * where the weight had got to by then.
 */
export function generateDemoTrends(today: string): TrendsData {
  const epoch = addDays(today, -DEMO_SPAN_DAYS)

  const energy: DailyEnergyRow[] = []
  const intake: DailyIntakeRow[] = []
  const weights: WeightEntry[] = []

  let cumulativeNet = 0

  for (let offset = 0; offset <= DEMO_SPAN_DAYS; offset += 1) {
    const day = addDays(epoch, offset)
    const isToday = day === today
    const weekday = parseDayKey(day).getDay()
    const isWeekend = weekday === 0 || weekday === 6

    // Burn: a steady resting baseline plus activity that dips at weekends.
    const burned = Math.round(
      2360 + (isWeekend ? -90 : 60) + pseudo(day, 1) * 420 - 120,
    )
    // Eat: aiming a few hundred under, with weekends undoing some of it.
    const eaten = Math.round(
      burned - 620 + (isWeekend ? 430 : 0) + pseudo(day, 2) * 520 - 200,
    )

    const skippedSync = pseudo(day, 3) < 0.06
    const skippedMeals = pseudo(day, 4) < 0.08

    if (isToday) {
      // Part way through the day: enough to draw, not enough to confirm.
      const share = Math.max(0.1, new Date().getHours() / 24)
      energy.push({ day, total_energy: Math.round(burned * share) })
      intake.push({ day, eaten: Math.round(eaten * share), meal_count: 2 })
    } else {
      if (!skippedSync) energy.push({ day, total_energy: burned })
      if (!skippedMeals) intake.push({ day, eaten, meal_count: 3 })
      if (!skippedSync && !skippedMeals) cumulativeNet += eaten - burned
    }

    // Weight follows the calories, plus a slow water swing and scale noise -
    // which is exactly the wobble the trailing average exists to see through.
    const wave = Math.sin(offset / 9) * 0.45
    const noise = pseudo(day, 5) * 0.7 - 0.35
    const weight = DEMO_START_WEIGHT + cumulativeNet / KCAL_PER_KG + wave + noise

    // Weighed roughly three mornings a week, never on a fixed schedule.
    if (offset === 0 || pseudo(day, 6) < 0.44) {
      const at = parseDayKey(day)
      at.setHours(7, 30, 0, 0)
      weights.push({ logged_at: at.toISOString(), weight_kg: Number(weight.toFixed(2)) })
    }
  }

  return { energy, intake, weights, goalWeightKg: DEMO_GOAL_WEIGHT }
}
