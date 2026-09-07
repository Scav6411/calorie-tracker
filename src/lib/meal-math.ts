// Pure shapes and derivations for meal logging. No I/O here, so this stays
// unit-testable - and importable without the Supabase env vars that
// src/lib/supabase.ts throws for at module scope.

import { formatHour, type DayEntry } from '@/lib/mock-data'
import { toDecimalHour } from '@/lib/energy-math'

export type MealTag = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export const MEAL_TAGS: MealTag[] = ['breakfast', 'lunch', 'dinner', 'snack']

/** How many "Log again" cards the Home row offers. */
export const RECENT_FOOD_LIMIT = 8

// These mirror the column checks so bad input is caught before Postgres sees it.
export const MAX_NAME_LENGTH = 120
export const MAX_UNIT_LENGTH = 32
/** numeric(7, 2) on meal_logs.quantity. */
export const MAX_QUANTITY = 99999.99
/** numeric(8, 2) on meal_logs.calories. */
export const MAX_CALORIES = 999999

export interface FoodItem {
  id: string
  name: string
  default_unit: string
  calories_per_unit: number
  is_personal: boolean
}

export interface MealLog {
  id: string
  name: string
  quantity: number
  unit: string
  calories: number
  meal_tag: MealTag
  logged_at: string
}

/** One row of public.recent_foods: the newest log of one distinct food. */
export interface RecentFood {
  /** lower(btrim(name)) - stable across re-logs, so it is the list key. */
  food_key: string
  food_item_id: string | null
  name: string
  quantity: number
  unit: string
  calories: number
  meal_tag: MealTag
  last_logged_at: string
}

export interface MealLogInput {
  /** null for a one-off that was never added to the catalogue. */
  foodItemId: string | null
  name: string
  quantity: number
  unit: string
  calories: number
  mealTag: MealTag
  loggedAt: Date
}

/** Meal tag implied by the time of day; the user can always override it. */
export function tagForHour(hour: number): MealTag {
  if (hour >= 5 && hour < 11) return 'breakfast'
  if (hour >= 11 && hour < 16) return 'lunch'
  if (hour >= 16 && hour < 21) return 'dinner'
  return 'snack'
}

/**
 * Collapses internal runs of whitespace as well as trimming, so a stored name
 * can never disagree with foodKey below. Postgres btrim() strips spaces only -
 * a tab would pass the column check and then key differently in the client.
 */
export function normaliseName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)
}

export function normaliseUnit(raw: string | null | undefined): string {
  const unit = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_UNIT_LENGTH)
  return unit === '' ? 'serving' : unit
}

/** Must produce exactly what lower(btrim(name)) produces in recent_foods. */
export function foodKey(name: string): string {
  return normaliseName(name).toLowerCase()
}

/**
 * Typed quantity entry. Returns null for anything the column would reject, so
 * the caller can hold submit disabled rather than surface a raw constraint
 * error. Rounds to the column's two decimal places, so the number on screen is
 * the number that gets stored.
 */
export function parseQuantity(raw: string): number | null {
  const text = raw.trim().replace(',', '.')
  if (text === '') return null
  const value = Number(text)
  if (!Number.isFinite(value)) return null
  const rounded = Math.round(value * 100) / 100
  if (rounded <= 0 || rounded > MAX_QUANTITY) return null
  return rounded
}

/** Clamped so a large quantity cannot overflow numeric(8, 2). */
export function caloriesFor(caloriesPerUnit: number, quantity: number): number {
  return Math.min(Math.round(caloriesPerUnit * quantity), MAX_CALORIES)
}

/** One tap on a "Log again" card: same food, same everything, new timestamp. */
export function relogInput(recent: RecentFood, loggedAt: Date): MealLogInput {
  return {
    foodItemId: recent.food_item_id,
    name: recent.name,
    quantity: recent.quantity,
    unit: recent.unit,
    calories: recent.calories,
    mealTag: recent.meal_tag,
    loggedAt,
  }
}

/** A freshly written log, shaped as the recent_foods row it just became. */
export function recentFromLog(log: MealLog, foodItemId: string | null): RecentFood {
  return {
    food_key: foodKey(log.name),
    food_item_id: foodItemId,
    name: log.name,
    quantity: log.quantity,
    unit: log.unit,
    calories: log.calories,
    meal_tag: log.meal_tag,
    last_logged_at: log.logged_at,
  }
}

/**
 * Moves a just-logged food to the front. Exact rather than optimistic: the new
 * log genuinely is the newest entry for that key, so an insert needs no refetch.
 */
export function promoteRecent(
  list: RecentFood[],
  entry: RecentFood,
  limit = RECENT_FOOD_LIMIT,
): RecentFood[] {
  return [entry, ...list.filter((item) => item.food_key !== entry.food_key)].slice(0, limit)
}

/**
 * Postgres error codes the log sheet can actually provoke. Without this the
 * user reads raw constraint text.
 */
export function mealWriteError(error: { code?: string | null; message: string }): string {
  switch (error.code) {
    case '23505':
      return 'You already have a food with that name'
    // food_item_id points at a row deleted since it was picked.
    case '23503':
      return 'That food was removed. Log it as a one-off instead.'
    case '23514':
      return 'Check the name, quantity and unit'
    case '22003':
      return 'That number is too large'
    case '22P02':
      return 'That entry is no longer valid'
    case '42501':
      return 'Your session expired. Sign in again.'
    default:
      return error.message
  }
}

export function mealLogToEntry(log: MealLog): DayEntry {
  const at = toDecimalHour(log.logged_at)
  const slot = log.meal_tag.charAt(0).toUpperCase() + log.meal_tag.slice(1)
  return {
    id: log.id,
    kind: 'meal',
    title: log.name,
    detail: `${slot} · ${formatHour(at)}`,
    at,
    kcal: Math.round(log.calories),
  }
}
