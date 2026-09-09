// Pure derivations over energy readings. No I/O, so this stays unit testable.

/**
 * What a row means.
 *
 * 'hourly' is what Apple Health sends now: one row per hour holding the burn
 * inside that hour alone. 'cumulative' is how readings were written before
 * 2026-09-09 - a snapshot of the day's running total at synced_at. The two
 * combine differently, so every derivation below branches on this rather than
 * assuming one shape.
 */
export type EnergyGranularity = 'cumulative' | 'hourly'

export interface EnergyReading {
  id: string
  /** For an hourly row, the start of the hour it describes - not the upload. */
  synced_at: string
  active_energy: number
  resting_energy: number
  total_energy: number
  granularity: EnergyGranularity
  /** When the row was last written. This is the real upload time. */
  updated_at: string
}

/** Burn attributed to one local hour, split into movement and baseline. */
export interface HourlyBurn {
  hour: number
  active: number
  resting: number
}

export interface DayTotals {
  active: number
  resting: number
  total: number
  lastSyncedAt: string
  readingCount: number
}

/** Hour of the day as a decimal, in the viewer's local time. */
export function toDecimalHour(iso: string) {
  const date = new Date(iso)
  return date.getHours() + date.getMinutes() / 60
}

/** Energy is stored to 2 decimals; summing 24 of them needs rounding back. */
function round2(value: number) {
  return Math.round(value * 100) / 100
}

/** The most recent upload behind any of these rows. */
function lastUpload(readings: EnergyReading[]) {
  return readings.reduce(
    (latest, reading) => (reading.updated_at > latest ? reading.updated_at : latest),
    readings[0].updated_at,
  )
}

/**
 * The day's totals, derived from the readings themselves - no second request.
 *
 * Hourly rows are disjoint slices of the day, so they add up. Cumulative rows
 * are repeated running totals of the same day, so the largest one is the total.
 * A day that holds any hourly row is treated as an hourly day: the changeover
 * day has both kinds, and adding a running total onto a set of buckets would
 * count that day roughly twice.
 */
export function dayTotals(readings: EnergyReading[]): DayTotals | null {
  if (readings.length === 0) return null

  const hourly = readings.filter((reading) => reading.granularity === 'hourly')
  const lastSyncedAt = lastUpload(readings)

  if (hourly.length > 0) {
    const active = hourly.reduce((sum, reading) => sum + reading.active_energy, 0)
    const resting = hourly.reduce((sum, reading) => sum + reading.resting_energy, 0)
    return {
      active: round2(active),
      resting: round2(resting),
      total: round2(active + resting),
      lastSyncedAt,
      readingCount: hourly.length,
    }
  }

  return readings.reduce<DayTotals>(
    (best, reading) =>
      reading.total_energy >= best.total
        ? {
            active: reading.active_energy,
            resting: reading.resting_energy,
            total: reading.total_energy,
            lastSyncedAt,
            readingCount: readings.length,
          }
        : best,
    { active: 0, resting: 0, total: 0, lastSyncedAt, readingCount: readings.length },
  )
}

/**
 * Burn per local hour.
 *
 * Hourly rows already are this, so they only need bucketing by local hour -
 * the row's synced_at is the hour it covers. Cumulative rows carry the day's
 * running total instead, so an hour's burn is the step from the previous
 * hour's last reading, clamped at zero because Health occasionally revises a
 * total downwards.
 *
 * Empty hours are dropped either way: a bar of zero says nothing, and most of
 * a day is zeros.
 */
export function toHourlyBurn(readings: EnergyReading[]): HourlyBurn[] {
  const hourly = readings.filter((reading) => reading.granularity === 'hourly')

  if (hourly.length > 0) {
    const byHour = new Map<number, HourlyBurn>()
    for (const reading of hourly) {
      const hour = new Date(reading.synced_at).getHours()
      const current = byHour.get(hour) ?? { hour, active: 0, resting: 0 }
      byHour.set(hour, {
        hour,
        active: current.active + reading.active_energy,
        resting: current.resting + reading.resting_energy,
      })
    }

    return [...byHour.values()]
      .filter((bucket) => bucket.active + bucket.resting > 0)
      .sort((a, b) => a.hour - b.hour)
      .map((bucket) => ({
        hour: bucket.hour,
        active: Math.round(bucket.active),
        resting: Math.round(bucket.resting),
      }))
  }

  const lastOfHour = new Map<number, EnergyReading>()
  for (const reading of readings) {
    const hour = new Date(reading.synced_at).getHours()
    const current = lastOfHour.get(hour)
    if (!current || reading.synced_at > current.synced_at) lastOfHour.set(hour, reading)
  }

  const hours = [...lastOfHour.keys()].sort((a, b) => a - b)
  const result: HourlyBurn[] = []
  let previousActive = 0
  let previousResting = 0

  for (const hour of hours) {
    const reading = lastOfHour.get(hour)!
    const active = Math.max(0, reading.active_energy - previousActive)
    const resting = Math.max(0, reading.resting_energy - previousResting)
    previousActive = reading.active_energy
    previousResting = reading.resting_energy

    if (active + resting > 0) {
      result.push({ hour, active: Math.round(active), resting: Math.round(resting) })
    }
  }

  return result
}

/**
 * How stale the Health sync is, in words.
 *
 * A clock time ("synced 14:32") does not answer the question actually being
 * asked, which is "did the automation fire?". iOS defers time-of-day
 * automations while the phone is locked, so the gap between the last upload and
 * now is the thing worth showing.
 */
export function syncAgeLabel(lastSyncedAt: string, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(lastSyncedAt).getTime()) / 60_000)

  // A clock skew between the phone and the server can put this slightly ahead.
  if (minutes < 2) return 'just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return days === 1 ? 'yesterday' : `${days}d ago`
}
