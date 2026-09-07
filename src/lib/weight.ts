import { supabase } from '@/lib/supabase'

export interface WeightLog {
  id: string
  weight_kg: number
  logged_at: string
}

const num = (value: unknown) => Number(value ?? 0)

/** The most recent reading, used to start the wheels where you left off. */
export async function fetchLatestWeight(): Promise<WeightLog | null> {
  const { data, error } = await supabase
    .from('weight_logs')
    .select('id, weight_kg, logged_at')
    .order('logged_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    id: data.id as string,
    weight_kg: num(data.weight_kg),
    logged_at: data.logged_at as string,
  }
}

/** Plain authenticated write; RLS enforces ownership. */
export async function insertWeightLog(input: {
  weightKg: number
  loggedAt: Date
}): Promise<WeightLog> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')

  const { data, error } = await supabase
    .from('weight_logs')
    .upsert(
      {
        user_id: auth.user.id,
        weight_kg: input.weightKg,
        logged_at: input.loggedAt.toISOString(),
      },
      // A double submit at the same instant corrects rather than duplicates.
      { onConflict: 'user_id,logged_at' },
    )
    .select('id, weight_kg, logged_at')
    .single()

  if (error) throw new Error(error.message)
  return {
    id: data.id as string,
    weight_kg: num(data.weight_kg),
    logged_at: data.logged_at as string,
  }
}
