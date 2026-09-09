import { describe, expect, it } from 'vitest'
import {
  dayTotals,
  syncAgeLabel,
  toHourlyBurn,
  type EnergyReading,
} from '@/lib/energy-math'

const NOW = new Date('2026-09-08T12:00:00+05:30')
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()

describe('syncAgeLabel', () => {
  it('answers "did the sync just run?" rather than "what time is it"', () => {
    expect(syncAgeLabel(ago(0), NOW)).toBe('just now')
    expect(syncAgeLabel(ago(1), NOW)).toBe('just now')
    expect(syncAgeLabel(ago(2), NOW)).toBe('2m ago')
    expect(syncAgeLabel(ago(45), NOW)).toBe('45m ago')
    expect(syncAgeLabel(ago(60), NOW)).toBe('1h ago')
    expect(syncAgeLabel(ago(60 * 5), NOW)).toBe('5h ago')
  })

  it('rolls over to days once the reading is not from today', () => {
    expect(syncAgeLabel(ago(60 * 24), NOW)).toBe('yesterday')
    expect(syncAgeLabel(ago(60 * 24 * 3), NOW)).toBe('3d ago')
  })

  it('reads a phone clock running ahead of the server as "just now"', () => {
    // The Shortcut stamps synced_at from the phone, so a small skew can put it
    // in the future. Negative minutes must not render as "-3m ago".
    expect(syncAgeLabel(ago(-3), NOW)).toBe('just now')
  })
})

/** TZ is pinned to Asia/Kolkata in vitest.config.ts, so +05:30 is local. */
const at = (hour: number) => `2026-09-09T${String(hour).padStart(2, '0')}:00:00+05:30`

/** One hour's own burn, as the Health Shortcut uploads it. */
function bucket(hour: number, active: number, resting: number, uploadedAt = at(23)): EnergyReading {
  return {
    id: `hour-${hour}`,
    synced_at: at(hour),
    active_energy: active,
    resting_energy: resting,
    total_energy: active + resting,
    granularity: 'hourly',
    updated_at: uploadedAt,
  }
}

/** A pre-2026-09-09 snapshot: the day's running total at an instant. */
function snapshot(hour: number, active: number, resting: number): EnergyReading {
  return {
    id: `snap-${hour}`,
    synced_at: at(hour),
    active_energy: active,
    resting_energy: resting,
    total_energy: active + resting,
    granularity: 'cumulative',
    updated_at: at(hour),
  }
}

describe('dayTotals', () => {
  it('adds hourly buckets up rather than taking the largest', () => {
    // The bug this guards: max() over buckets returns the busiest single hour.
    const totals = dayTotals([bucket(0, 20, 92), bucket(1, 17, 105), bucket(2, 4, 98)])
    expect(totals).toMatchObject({ active: 41, resting: 295, total: 336 })
  })

  it('takes the largest cumulative snapshot, since those are running totals', () => {
    const totals = dayTotals([snapshot(8, 120, 400), snapshot(14, 310, 700), snapshot(20, 480, 980)])
    expect(totals).toMatchObject({ active: 480, resting: 980, total: 1460 })
  })

  it('treats the changeover day as hourly and ignores the stale running total', () => {
    // Both kinds land on the day the sync format changed. Adding the snapshot
    // onto the buckets would count most of that day twice.
    const totals = dayTotals([snapshot(9, 300, 500), bucket(0, 20, 92), bucket(1, 17, 105)])
    expect(totals).toMatchObject({ active: 37, resting: 197, total: 234 })
  })

  it('reports the upload time, not the hour the bucket covers', () => {
    // A sync at 21:00 rewrites the midnight bucket. Reading synced_at there
    // would render "synced 21h ago" seconds after a successful sync.
    const totals = dayTotals([bucket(0, 20, 92, at(21)), bucket(1, 17, 105, at(21))])
    expect(totals?.lastSyncedAt).toBe(at(21))
  })

  it('keeps a 24-bucket sum free of float dust', () => {
    const buckets = Array.from({ length: 24 }, (_, hour) => bucket(hour, 0.1, 0.2))
    expect(dayTotals(buckets)).toMatchObject({ active: 2.4, resting: 4.8, total: 7.2 })
  })

  it('has nothing to report for a day with no readings', () => {
    expect(dayTotals([])).toBeNull()
  })
})

describe('toHourlyBurn', () => {
  it('passes hourly buckets through without differencing them', () => {
    expect(toHourlyBurn([bucket(0, 20, 92), bucket(1, 17, 105)])).toEqual([
      { hour: 0, active: 20, resting: 92 },
      { hour: 1, active: 17, resting: 105 },
    ])
  })

  it('drops the empty hours a filled-in day is mostly made of', () => {
    const buckets = [bucket(0, 20, 92), bucket(1, 0, 0), bucket(2, 0, 0), bucket(3, 5, 60)]
    expect(toHourlyBurn(buckets).map((entry) => entry.hour)).toEqual([0, 3])
  })

  it('orders by hour whatever order the rows arrive in', () => {
    const buckets = [bucket(7, 30, 60), bucket(2, 10, 50), bucket(19, 80, 62)]
    expect(toHourlyBurn(buckets).map((entry) => entry.hour)).toEqual([2, 7, 19])
  })

  it('still differences cumulative snapshots into per-hour steps', () => {
    const snapshots = [snapshot(8, 100, 400), snapshot(9, 160, 460), snapshot(10, 175, 520)]
    expect(toHourlyBurn(snapshots)).toEqual([
      { hour: 8, active: 100, resting: 400 },
      { hour: 9, active: 60, resting: 60 },
      { hour: 10, active: 15, resting: 60 },
    ])
  })

  it('clamps a cumulative total that Health revised downwards', () => {
    const snapshots = [snapshot(8, 100, 400), snapshot(9, 90, 460)]
    expect(toHourlyBurn(snapshots)[1]).toEqual({ hour: 9, active: 0, resting: 60 })
  })
})
