import { supabase } from '@/lib/supabase'
import {
  mealWriteError,
  normaliseName,
  normaliseUnit,
  RECENT_FOOD_LIMIT,
  type FoodItem,
  type MealLog,
  type MealLogInput,
  type MealTag,
  type RecentFood,
} from '@/lib/meal-math'

// The pure half lives in meal-math.ts so it can be imported without the
// Supabase client. Re-exported so callers only ever need this module.
export * from '@/lib/meal-math'

/** PostgREST can hand numerics back as strings; normalise before arithmetic. */
const num = (value: unknown) => Number(value ?? 0)

/** Ranked search over foods the user can see. Personal items come first. */
export async function searchFoods(query: string, limit = 10): Promise<FoodItem[]> {
  const { data, error } = await supabase.rpc('search_foods', {
    query,
    max_results: limit,
  })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    default_unit: row.default_unit as string,
    calories_per_unit: num(row.calories_per_unit),
    is_personal: Boolean(row.is_personal),
  }))
}

/** Creates a food owned by the current user and returns it ready to select. */
export async function createFoodItem(input: {
  name: string
  caloriesPerUnit: number
  unit?: string
}): Promise<FoodItem> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')

  const { data, error } = await supabase
    .from('food_items')
    .insert({
      user_id: auth.user.id,
      name: normaliseName(input.name),
      default_unit: normaliseUnit(input.unit),
      calories_per_unit: input.caloriesPerUnit,
    })
    .select('id, name, default_unit, calories_per_unit')
    .single()

  if (error) throw new Error(mealWriteError(error))

  return {
    id: data.id as string,
    name: data.name as string,
    default_unit: data.default_unit as string,
    calories_per_unit: num(data.calories_per_unit),
    is_personal: true,
  }
}

export async function fetchMealLogs(date: Date): Promise<MealLog[]> {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 1)

  const { data, error } = await supabase
    .from('meal_logs')
    .select('id, name, quantity, unit, calories, meal_tag, logged_at')
    .gte('logged_at', start.toISOString())
    .lt('logged_at', end.toISOString())
    .order('logged_at', { ascending: true })
    // Tiebreak: one-tap re-logging makes two rows at the same instant easy to
    // produce, and without this their order would vary between fetches.
    .order('id', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    quantity: num(row.quantity),
    unit: row.unit as string,
    calories: num(row.calories),
    meal_tag: row.meal_tag as MealTag,
    logged_at: row.logged_at as string,
  }))
}

/**
 * The "Log again" row. The view has already picked one row per distinct food;
 * the ordering and the limit have to be applied here, because the view's own
 * ORDER BY exists only to drive its distinct on and does not survive this query.
 */
export async function fetchRecentFoods(limit = RECENT_FOOD_LIMIT): Promise<RecentFood[]> {
  const { data, error } = await supabase
    .from('recent_foods')
    .select('food_key, food_item_id, name, quantity, unit, calories, meal_tag, last_logged_at')
    .order('last_logged_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    food_key: row.food_key as string,
    food_item_id: (row.food_item_id as string | null) ?? null,
    name: row.name as string,
    quantity: num(row.quantity),
    unit: row.unit as string,
    calories: num(row.calories),
    meal_tag: row.meal_tag as MealTag,
    last_logged_at: row.last_logged_at as string,
  }))
}

/**
 * A plain authenticated insert - RLS already enforces ownership, so this needs
 * no edge function. name and calories are snapshotted so later edits to the
 * food never rewrite history, and foodItemId may be null: a one-off is logged
 * without ever creating a permanent food_items row.
 */
export async function insertMealLog(input: MealLogInput): Promise<MealLog> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')

  const { data, error } = await supabase
    .from('meal_logs')
    .insert({
      user_id: auth.user.id,
      food_item_id: input.foodItemId,
      name: normaliseName(input.name),
      quantity: input.quantity,
      unit: normaliseUnit(input.unit),
      calories: input.calories,
      meal_tag: input.mealTag,
      logged_at: input.loggedAt.toISOString(),
    })
    .select('id, name, quantity, unit, calories, meal_tag, logged_at')
    .single()

  if (error) throw new Error(mealWriteError(error))
  return {
    id: data.id as string,
    name: data.name as string,
    quantity: num(data.quantity),
    unit: data.unit as string,
    calories: num(data.calories),
    meal_tag: data.meal_tag as MealTag,
    logged_at: data.logged_at as string,
  }
}

/**
 * Returns whether a row was actually removed. Without the select this could not
 * tell a delete from a no-op: RLS filters a row belonging to someone else out
 * of the statement rather than erroring, so a bare delete reports success for a
 * row it never touched. No .single() - that raises PGRST116 on zero rows, which
 * would turn "already gone" into a crash.
 *
 * The returned representation is produced under the SELECT policy, so this
 * depends on meal_logs_select_own matching meal_logs_delete_own. They do today.
 */
export async function deleteMealLog(id: string): Promise<boolean> {
  const { data, error } = await supabase.from('meal_logs').delete().eq('id', id).select('id')

  if (error) throw new Error(mealWriteError(error))
  return (data ?? []).length > 0
}
