// Pure derivations over energy readings. No I/O, so this stays unit testable.

export interface EnergyReading {
  id: string
  synced_at: string
  active_energy: number
  resting_energy: number
  total_energy: number
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

/**
 * The day's totals, derived from the readings themselves - no second request.
 * Values are cumulative, so the largest reading is the day's total.
 */
export function dayTotals(readings: EnergyReading[]): DayTotals | null {
  if (readings.length === 0) return null

  return readings.reduce<DayTotals>(
    (best, reading) =>
      reading.total_energy >= best.total
        ? {
            active: reading.active_energy,
            resting: reading.resting_energy,
            total: reading.total_energy,
            lastSyncedAt: reading.synced_at,
            readingCount: readings.length,
          }
        : best,
    { active: 0, resting: 0, total: 0, lastSyncedAt: readings[0].synced_at, readingCount: readings.length },
  )
}

/**
 * Burn per local hour.
 *
 * Readings carry the day's running total, so an hour's burn is the step from
 * the previous hour's last reading. Bucketing by hour rather than by reading
 * keeps the bars comparable when a sync is missed or fires twice, and steps are
 * clamped at zero because Health occasionally revises a total downwards.
 */
export function toHourlyBurn(readings: EnergyReading[]): HourlyBurn[] {
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
