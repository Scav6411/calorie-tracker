// Contract tests for the meal-logging SQL: RLS isolation, the recent_foods
// view, and delete-reports-what-it-did. These hit the real linked project, so
// they are skipped unless a service-role key is present.
//
//   SUPABASE_SERVICE_ROLE_KEY=... npm test
//
// Deliberately does NOT import @/lib/meals: that module binds the shared
// singleton client to one session, and these tests need two users at once. The
// queries below mirror it exactly - what is under test is the schema.

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

function fromEnvFile(file: string, key: string): string | undefined {
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const index = trimmed.indexOf('=')
      if (index > 0 && trimmed.slice(0, index).trim() === key) {
        return trimmed.slice(index + 1).trim()
      }
    }
  } catch {
    // No such file: the caller falls back to process.env.
  }
  return undefined
}

const url =
  process.env.SUPABASE_URL ??
  fromEnvFile('.env.test.local', 'SUPABASE_URL') ??
  fromEnvFile('.env.local', 'VITE_SUPABASE_URL')
const anonKey =
  process.env.SUPABASE_ANON_KEY ??
  fromEnvFile('.env.test.local', 'SUPABASE_ANON_KEY') ??
  fromEnvFile('.env.local', 'VITE_SUPABASE_ANON_KEY')
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? fromEnvFile('.env.test.local', 'SUPABASE_SERVICE_ROLE_KEY')

const configured = Boolean(url && anonKey && serviceRoleKey)

// RFC 2606 reserves .test: undeliverable, and unmistakably not a real address
// nor the @example.com a previous run orphaned users under.
const PREFIX = 'ct-itest-'
const DOMAIN = 'calorie-tracker.test'

const isDisposable = (email: string | null | undefined) =>
  Boolean(email && email.startsWith(PREFIX) && email.endsWith(`@${DOMAIN}`))

describe.skipIf(!configured)('meal logging against the real schema', () => {
  // Built in beforeAll, not here: describe.skipIf still evaluates this body to
  // collect the tests, and createClient(undefined) throws.
  let admin: SupabaseClient

  /** Every user this run made, deleted in afterAll whatever else happens. */
  const created: string[] = []

  async function makeUser() {
    const email = `${PREFIX}${randomUUID()}@${DOMAIN}`
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true })
    if (error) throw error
    // Registered before anything else can throw - a failed sign-in below must
    // still get torn down. Skipping this is exactly how the last run orphaned.
    created.push(data.user.id)

    // A magic link rather than signUp: no email is sent, so this cannot trip
    // the project's signup rate limit or leave unconfirmed users behind.
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    if (link.error) throw link.error

    const client = createClient(url as string, anonKey as string, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const { error: otpError } = await client.auth.verifyOtp({
      token_hash: link.data.properties.hashed_token,
      type: 'email',
    })
    if (otpError) throw otpError
    return { id: data.user.id, client }
  }

  let a: { id: string; client: SupabaseClient }
  let b: { id: string; client: SupabaseClient }
  let foodId: string
  const poha = `itest-poha-${randomUUID().slice(0, 8)}`
  const dal = `itest-dal-${randomUUID().slice(0, 8)}`

  const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString()

  beforeAll(async () => {
    admin = createClient(url as string, serviceRoleKey as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // A crashed run leaves users behind and they accumulate until they break
    // the next one. Sweep every disposable user before starting; deleting the
    // auth row cascades to all of its data, so this is the whole cleanup.
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    if (error) throw error
    for (const user of data.users) {
      if (isDisposable(user.email)) await admin.auth.admin.deleteUser(user.id, false)
    }

    a = await makeUser()
    b = await makeUser()

    const food = await a.client
      .from('food_items')
      .insert({ user_id: a.id, name: poha, default_unit: 'bowl', calories_per_unit: 250 })
      .select('id')
      .single()
    if (food.error) throw food.error
    foodId = food.data.id as string

    const seeded = await a.client.from('meal_logs').insert([
      // Same food twice: the view must keep only the later one.
      { user_id: a.id, food_item_id: foodId, name: poha, quantity: 1, unit: 'bowl', calories: 250, meal_tag: 'breakfast', logged_at: at(5) },
      { user_id: a.id, food_item_id: foodId, name: poha, quantity: 2, unit: 'bowl', calories: 500, meal_tag: 'lunch', logged_at: at(3) },
      // A one-off, never added to the catalogue.
      { user_id: a.id, food_item_id: null, name: dal, quantity: 1, unit: 'bowl', calories: 180, meal_tag: 'dinner', logged_at: at(1) },
    ])
    if (seeded.error) throw seeded.error
  }, 60_000)

  afterAll(async () => {
    const failures: string[] = []
    for (const id of created) {
      try {
        const { data } = await admin.auth.admin.getUserById(id)
        if (!data?.user) continue
        // Re-checked against the fetched record, never a local variable, so a
        // stale id can never reach a real account.
        if (!isDisposable(data.user.email)) {
          failures.push(`refused to delete non-test user ${id}`)
          continue
        }
        const { error } = await admin.auth.admin.deleteUser(id, false)
        if (error) failures.push(`${id}: ${error.message}`)
      } catch (cause) {
        failures.push(`${id}: ${String(cause)}`)
      }
    }
    created.length = 0
    // Fail loudly rather than orphan silently.
    if (failures.length > 0) throw new Error(`teardown left users behind:\n${failures.join('\n')}`)
  }, 60_000)

  it('returns the day the meals were logged on, newest last', async () => {
    const { data, error } = await a.client
      .from('meal_logs')
      .select('id, name, calories, logged_at')
      .order('logged_at', { ascending: true })
      .order('id', { ascending: true })

    expect(error).toBeNull()
    expect(data).toHaveLength(3)
    // PostgREST can hand numerics back as strings; the day total depends on
    // these being numbers, so this guards the coercion in meals.ts.
    expect(typeof data?.[0].calories).toBe('number')
  })

  it('collapses repeats of one food to its most recent entry', async () => {
    const { data, error } = await a.client
      .from('recent_foods')
      .select('food_key, food_item_id, name, quantity, calories, meal_tag')
      .order('last_logged_at', { ascending: false })

    expect(error).toBeNull()
    // Two distinct foods from three logs.
    expect(data).toHaveLength(2)
    expect(data?.[0].name).toBe(dal)

    const repeated = data?.find((row) => row.name === poha)
    // The later of the two, not the first.
    expect(Number(repeated?.quantity)).toBe(2)
    expect(Number(repeated?.calories)).toBe(500)
    expect(repeated?.meal_tag).toBe('lunch')
  })

  it('keeps a one-off in the list with no food id', async () => {
    const { data } = await a.client
      .from('recent_foods')
      .select('name, food_item_id')
      .eq('name', dal)
      .single()

    expect(data?.food_item_id).toBeNull()
  })

  it('survives the catalogue row being deleted', async () => {
    const removed = await a.client.from('food_items').delete().eq('id', foodId).select('id')
    expect(removed.data).toHaveLength(1)

    // on delete set null, and name/calories are snapshots, which is exactly why
    // recent_foods groups by name rather than food_item_id.
    const { data } = await a.client
      .from('recent_foods')
      .select('name, food_item_id, calories')
      .eq('name', poha)
      .single()

    expect(data).not.toBeNull()
    expect(data?.food_item_id).toBeNull()
    expect(Number(data?.calories)).toBe(500)
  })

  it('reports a real delete and a no-op differently', async () => {
    const { data: rows } = await a.client.from('meal_logs').select('id').eq('name', dal).single()
    const id = rows?.id as string

    const hit = await a.client.from('meal_logs').delete().eq('id', id).select('id')
    expect(hit.error).toBeNull()
    expect(hit.data).toHaveLength(1)

    // The case a bare delete could not distinguish, and .single() would crash on.
    const miss = await a.client.from('meal_logs').delete().eq('id', randomUUID()).select('id')
    expect(miss.error).toBeNull()
    expect(miss.data).toHaveLength(0)
  })

  it('hides one user’s meals from another', async () => {
    const { data, error } = await b.client.from('meal_logs').select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('does not leak recent foods across users', async () => {
    // The one test that catches a recent_foods view created without
    // security_invoker: it would run as its owner and expose every user's rows.
    const { data, error } = await b.client.from('recent_foods').select('name')
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('silently deletes nothing when the row belongs to someone else', async () => {
    const mine = await a.client.from('meal_logs').select('id').limit(1).single()
    const id = mine.data?.id as string

    const attempt = await b.client.from('meal_logs').delete().eq('id', id).select('id')
    // RLS filters the row out of the statement rather than raising, which is
    // why deleteMealLog has to report the row count instead of just "no error".
    expect(attempt.error).toBeNull()
    expect(attempt.data).toHaveLength(0)

    const survived = await a.client.from('meal_logs').select('id').eq('id', id)
    expect(survived.data).toHaveLength(1)
  })

  it('refuses a meal written on behalf of another user', async () => {
    const { error } = await b.client
      .from('meal_logs')
      .insert({ user_id: a.id, name: 'spoof', quantity: 1, unit: 'bowl', calories: 1, meal_tag: 'snack' })

    expect(error?.code).toBe('42501')
  })

  it('shows global foods to everyone and personal foods to nobody else', async () => {
    const globals = await b.client.from('food_items').select('id').is('user_id', null).limit(1)
    expect(globals.data?.length).toBe(1)

    const personal = await b.client.from('food_items').select('id').eq('user_id', a.id)
    expect(personal.data).toHaveLength(0)
  })
})
