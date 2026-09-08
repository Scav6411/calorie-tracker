import { describe, expect, it } from 'vitest'
import { syncAgeLabel } from '@/lib/energy-math'

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
