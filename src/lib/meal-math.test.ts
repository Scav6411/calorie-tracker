import { describe, expect, it } from 'vitest'
import {
  caloriesFor,
  foodKey,
  mealLogToEntry,
  mealWriteError,
  normaliseName,
  normaliseUnit,
  parseQuantity,
  promoteRecent,
  recentFromLog,
  relogInput,
  tagForHour,
  MAX_QUANTITY,
  type MealLog,
  type RecentFood,
} from '@/lib/meal-math'

// Guards the TZ pin in vitest.config.ts: without it, every local-time
// assertion below passes here and fails on a UTC machine.
it('runs with the timezone pinned', () => {
  expect(new Date('2026-01-01T00:00:00Z').getHours()).toBe(5)
})

describe('tagForHour', () => {
  it('maps every boundary', () => {
    expect(tagForHour(0)).toBe('snack')
    expect(tagForHour(4)).toBe('snack')
    expect(tagForHour(5)).toBe('breakfast')
    expect(tagForHour(10)).toBe('breakfast')
    expect(tagForHour(11)).toBe('lunch')
    expect(tagForHour(15)).toBe('lunch')
    expect(tagForHour(16)).toBe('dinner')
    expect(tagForHour(20)).toBe('dinner')
    expect(tagForHour(21)).toBe('snack')
    expect(tagForHour(23)).toBe('snack')
  })
})

describe('parseQuantity', () => {
  it('accepts what the column accepts', () => {
    expect(parseQuantity('1')).toBe(1)
    expect(parseQuantity('1.5')).toBe(1.5)
    expect(parseQuantity(' 2 ')).toBe(2)
    expect(parseQuantity('1,5')).toBe(1.5)
    expect(parseQuantity(String(MAX_QUANTITY))).toBe(MAX_QUANTITY)
  })

  it('rounds to the two decimals numeric(7,2) stores', () => {
    expect(parseQuantity('1.567')).toBe(1.57)
  })

  it('rejects anything the column would reject', () => {
    expect(parseQuantity('')).toBeNull()
    expect(parseQuantity('   ')).toBeNull()
    expect(parseQuantity('0')).toBeNull()
    expect(parseQuantity('-1')).toBeNull()
    expect(parseQuantity('abc')).toBeNull()
    // Rounds to 0, which would fail the quantity > 0 check.
    expect(parseQuantity('0.004')).toBeNull()
    expect(parseQuantity('100000')).toBeNull()
  })
})

describe('normalisation', () => {
  it('collapses whitespace, not just trims', () => {
    expect(normaliseName(' Dal  makhani ')).toBe('Dal makhani')
    // Postgres btrim strips spaces only, so a tab has to be handled here.
    expect(normaliseName('\tDal\tmakhani\n')).toBe('Dal makhani')
    expect(normaliseName('\t\n')).toBe('')
  })

  it('caps the name at the column length', () => {
    expect(normaliseName('a'.repeat(130))).toHaveLength(120)
  })

  it('falls back to a serving and preserves case', () => {
    expect(normaliseUnit('')).toBe('serving')
    expect(normaliseUnit(undefined)).toBe('serving')
    expect(normaliseUnit('   ')).toBe('serving')
    expect(normaliseUnit(' bowl ')).toBe('bowl')
    expect(normaliseUnit('Bowl')).toBe('Bowl')
    expect(normaliseUnit('u'.repeat(50))).toHaveLength(32)
  })

  it('keys agree with what the recent_foods view produces', () => {
    for (const raw of ['  Dal ', 'DAL', 'Dal\tMakhani', 'dal makhani']) {
      expect(foodKey(normaliseName(raw))).toBe(foodKey(raw))
      expect(foodKey(foodKey(raw))).toBe(foodKey(raw))
    }
    expect(foodKey(' Dal  Makhani ')).toBe('dal makhani')
  })
})

describe('caloriesFor', () => {
  it('rounds and clamps below the numeric(8,2) ceiling', () => {
    expect(caloriesFor(104, 2)).toBe(208)
    expect(caloriesFor(180, 0.33)).toBe(59)
    expect(caloriesFor(999999, 99999)).toBe(999999)
  })
})

const RECENT: RecentFood = {
  food_key: 'poha',
  food_item_id: 'food-1',
  name: 'Poha',
  quantity: 2,
  unit: 'bowl',
  calories: 500,
  meal_tag: 'breakfast',
  last_logged_at: '2026-09-01T03:00:00.000Z',
}

describe('relogInput', () => {
  it('reproduces the previous entry at a new time', () => {
    const at = new Date('2026-09-08T14:00:00.000Z')
    expect(relogInput(RECENT, at)).toEqual({
      foodItemId: 'food-1',
      name: 'Poha',
      quantity: 2,
      unit: 'bowl',
      calories: 500,
      // The tag comes from the previous log, not from the clock.
      mealTag: 'breakfast',
      loggedAt: at,
    })
  })

  it('carries a one-off through with no food id', () => {
    expect(relogInput({ ...RECENT, food_item_id: null }, new Date()).foodItemId).toBeNull()
  })
})

describe('promoteRecent', () => {
  const make = (key: string): RecentFood => ({ ...RECENT, food_key: key, name: key })

  it('prepends a new food', () => {
    const next = promoteRecent([make('a'), make('b')], make('c'))
    expect(next.map((item) => item.food_key)).toEqual(['c', 'a', 'b'])
  })

  it('moves an existing food to the front without duplicating it', () => {
    const list = ['a', 'b', 'c', 'd'].map(make)
    const next = promoteRecent(list, make('c'))
    expect(next.map((item) => item.food_key)).toEqual(['c', 'a', 'b', 'd'])
    expect(next).toHaveLength(4)
  })

  it('evicts the oldest past the limit', () => {
    const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(make)
    const next = promoteRecent(list, make('i'))
    expect(next).toHaveLength(8)
    expect(next[0].food_key).toBe('i')
    expect(next.map((item) => item.food_key)).not.toContain('h')
  })
})

describe('recentFromLog', () => {
  it('keys the row the same way the view does', () => {
    const log: MealLog = {
      id: 'log-1',
      name: ' Dal  Makhani ',
      quantity: 1,
      unit: 'bowl',
      calories: 250,
      meal_tag: 'dinner',
      logged_at: '2026-09-08T14:00:00.000Z',
    }
    const entry = recentFromLog(log, null)
    expect(entry.food_key).toBe('dal makhani')
    expect(entry.food_item_id).toBeNull()
    expect(entry.last_logged_at).toBe(log.logged_at)
  })
})

describe('mealWriteError', () => {
  it('maps the codes the log sheet can provoke', () => {
    expect(mealWriteError({ code: '23505', message: 'x' })).toMatch(/already have a food/)
    expect(mealWriteError({ code: '23503', message: 'x' })).toMatch(/one-off/)
    expect(mealWriteError({ code: '23514', message: 'x' })).toMatch(/quantity/)
    expect(mealWriteError({ code: '22003', message: 'x' })).toMatch(/too large/)
    expect(mealWriteError({ code: '42501', message: 'x' })).toMatch(/session expired/i)
  })

  it('passes anything else through untouched', () => {
    expect(mealWriteError({ code: 'XX999', message: 'boom' })).toBe('boom')
    expect(mealWriteError({ message: 'boom' })).toBe('boom')
  })
})

describe('mealLogToEntry', () => {
  it('renders the chart entry in local time', () => {
    // 02:42 UTC is 08:12 in Asia/Kolkata.
    const entry = mealLogToEntry({
      id: 'log-1',
      name: 'Oats',
      quantity: 1,
      unit: 'bowl',
      calories: 320.6,
      meal_tag: 'breakfast',
      logged_at: '2026-09-08T02:42:00.000Z',
    })
    expect(entry.at).toBeCloseTo(8.2, 2)
    expect(entry.kcal).toBe(321)
    expect(entry.kind).toBe('meal')
    expect(entry.title).toBe('Oats')
    expect(entry.detail).toBe('Breakfast · 8:12 am')
  })
})
