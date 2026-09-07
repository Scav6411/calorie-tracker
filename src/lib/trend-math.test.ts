// Ported from the ad-hoc scratchpad harness these were first written in, so
// they survive past the session that produced them. node:assert is kept rather
// than rewritten to expect(): the assertions were the reviewed part.
import assert from 'node:assert/strict'
import { it } from 'vitest'
import {
  KCAL_PER_KG, periodBounds, buildDays, summarisePeriod, bucketDays,
  weightSeries, weeklyProjection, addDays, signedKcal, signedKg, rangeLabel, weekStart,
} from '@/lib/trend-math'


const TODAY = '2026-09-06'

it('7D ends today and spans 7 days', () => {
  assert.deepEqual(periodBounds('7D', TODAY), { from: '2026-08-31', to: TODAY })
})
it('1Y snaps to twelve whole calendar months', () => {
  // TODAY is 2026-09-06, so the window opens on the 1st, eleven months back.
  assert.equal(periodBounds('1Y', TODAY).from, '2025-10-01')
})
it('6M snaps to a Monday so weekly bars are whole weeks', () => {
  const { from } = periodBounds('6M', TODAY)
  assert.equal(from, weekStart(from))
  assert.equal(from, '2026-03-09')
})

const energy = [
  { day: '2026-09-01', total_energy: 2400 },
  { day: '2026-09-02', total_energy: 2500 },
  { day: '2026-09-04', total_energy: 2300 },
  { day: TODAY, total_energy: 900 },
]
const intake = [
  { day: '2026-09-01', eaten: 2000, meal_count: 3 },
  { day: '2026-09-03', eaten: 1800, meal_count: 2 },
  { day: '2026-09-04', eaten: 2100, meal_count: 1 },
  { day: TODAY, eaten: 600, meal_count: 1 },
]
const days = buildDays('2026-09-01', TODAY, energy, intake, TODAY)

it('one row per calendar day, gaps included', () => assert.equal(days.length, 6))
it('energy + meals = confirmed', () => assert.equal(days[0].confirmed, true))
it('energy but zero meals is NOT confirmed', () => {
  assert.equal(days[1].day, '2026-09-02')
  assert.equal(days[1].hasEnergy, true)
  assert.equal(days[1].mealCount, 0)
  assert.equal(days[1].confirmed, false)
})
it('meals but no energy sync is NOT confirmed', () => {
  assert.equal(days[2].day, '2026-09-03')
  assert.equal(days[2].confirmed, false)
})
it('a single meal is enough to confirm', () => {
  assert.equal(days[3].mealCount, 1)
  assert.equal(days[3].confirmed, true)
})
it('today is in progress and never confirmed', () => {
  assert.equal(days[5].inProgress, true)
  assert.equal(days[5].confirmed, false)
})
it('deficit is negative', () => assert.equal(days[0].net, -400))

const summary = summarisePeriod(days)
it('averages over confirmed days only, not the calendar', () => {
  assert.equal(summary.confirmedDays, 2)
  assert.equal(summary.totalDays, 6)
  assert.equal(summary.loggedNet, -600)
  assert.equal(summary.avgNetPerDay, -300)
})
it('today is excluded from the completed-day count', () => {
  assert.equal(summary.completedDays, 5)
})
it('the period total carries the observed rate over unlogged days', () => {
  // Two logged days at -300 across five finished days, not a -600 subtotal
  // presented as if the other three days had been calorie neutral.
  assert.equal(summary.totalNet, -1500)
  assert.equal(summary.impliedWeightChangeKg, -1500 / KCAL_PER_KG)
})

const long = buildDays('2026-01-01', '2026-01-14',
  Array.from({ length: 14 }, (_, i) => ({ day: addDays('2026-01-01', i), total_energy: 2400 })),
  Array.from({ length: 14 }, (_, i) => ({ day: addDays('2026-01-01', i), eaten: 2000, meal_count: 3 })),
  TODAY)
it('weekly buckets follow the calendar, not the window start', () => {
  // 2026-01-01 is a Thursday, so the first bucket is a four-day stub of the
  // week that began on the Monday before the window opened.
  const weeks = bucketDays(long, 'week')
  assert.equal(weeks.length, 3)
  assert.deepEqual([weeks[0].from, weeks[0].to], ['2026-01-01', '2026-01-04'])
  assert.deepEqual([weeks[1].from, weeks[1].to], ['2026-01-05', '2026-01-11'])
  assert.deepEqual([weeks[2].from, weeks[2].to], ['2026-01-12', '2026-01-14'])
  assert.equal(weeks[1].avgNet, -400)
})
it('the same date lands in the same bucket whatever the window', () => {
  const wide = buildDays('2025-12-15', '2026-01-14',
    Array.from({ length: 31 }, (_, i) => ({ day: addDays('2025-12-15', i), total_energy: 2400 })),
    Array.from({ length: 31 }, (_, i) => ({ day: addDays('2025-12-15', i), eaten: 2000, meal_count: 3 })),
    TODAY)
  const narrow = bucketDays(long, 'week').find((b) => b.from <= '2026-01-07' && b.to >= '2026-01-07')
  const broad = bucketDays(wide, 'week').find((b) => b.from <= '2026-01-07' && b.to >= '2026-01-07')
  assert.equal(narrow?.key, broad?.key)
  assert.equal(broad?.from, '2026-01-05')
})
it('unconfirmed days do not become zero-calorie bars', () => {
  const sparse = buildDays('2026-01-05', '2026-01-11', [], [], TODAY)
  const [week] = bucketDays(sparse, 'week')
  assert.equal(week.confirmedDays, 0)
  assert.equal(week.eaten, 0)
  assert.equal(week.dayCount, 7)
})
it('monthly buckets follow the calendar', () => {
  const months = bucketDays(buildDays('2026-01-20', '2026-02-05', [], [], TODAY), 'month')
  assert.equal(months.length, 2)
  assert.equal(months[0].label, 'Jan')
  assert.equal(months[1].label, 'Feb')
})
it('a half-logged week averages per day rather than summing short', () => {
  // Three logged days out of seven must not read as a low-calorie week.
  const half = buildDays('2026-03-02', '2026-03-08',
    [0, 1, 2].map((i) => ({ day: addDays('2026-03-02', i), total_energy: 2400 })),
    [0, 1, 2].map((i) => ({ day: addDays('2026-03-02', i), eaten: 2000, meal_count: 3 })),
    TODAY)
  const [week] = bucketDays(half, 'week')
  assert.equal(week.confirmedDays, 3)
  assert.equal(week.dayCount, 7)
  assert.equal(week.avgEaten, 2000)
  assert.equal(week.avgBurned, 2400)
  assert.equal(week.avgNet, -400)
})
it('today gets its partial totals when it is a bar of its own', () => {
  const withToday = buildDays(TODAY, TODAY,
    [{ day: TODAY, total_energy: 900 }],
    [{ day: TODAY, eaten: 600, meal_count: 2 }],
    TODAY)
  const [bar] = bucketDays(withToday, 'day')
  assert.equal(bar.inProgress, true)
  assert.equal(bar.confirmedDays, 0)
  assert.equal(bar.avgEaten, 600)
  assert.equal(bar.avgBurned, 900)
})
it('the bucket holding today is flagged in progress', () => {
  const withToday = buildDays(addDays(TODAY, -3), TODAY, [], [], TODAY)
  assert.equal(bucketDays(withToday, 'week')[0].inProgress, true)
})

const entries = [
  { logged_at: new Date(2026, 0, 1, 8).toISOString(), weight_kg: 80 },
  { logged_at: new Date(2026, 0, 1, 20).toISOString(), weight_kg: 81 },
  { logged_at: new Date(2026, 0, 5, 8).toISOString(), weight_kg: 79 },
]
const weights = weightSeries(entries, '2026-01-01', '2026-01-12')
it('two weigh-ins on one day average into a single raw dot', () => {
  assert.equal(weights[0].raw, 80.5)
})
it('no fake dot on days that were never logged', () => {
  assert.equal(weights[1].raw, null)
})
it('trailing average spans the window, not just the day', () => {
  assert.equal(weights[4].day, '2026-01-05')
  assert.equal(weights[4].avg, (80 + 81 + 79) / 3)
})
it('the window still reaches back six days', () => {
  assert.equal(weights[9].day, '2026-01-10')
  assert.equal(weights[9].avg, 79)
})
it('the average expires once the window empties', () => {
  assert.equal(weights[11].day, '2026-01-12')
  assert.equal(weights[11].avg, null)
})

// Monday-aligned window so the blocks are two clean calendar weeks.
const MON = '2026-01-05'
const flatDays = buildDays(MON, '2026-01-18',
  Array.from({ length: 14 }, (_, i) => ({ day: addDays(MON, i), total_energy: 2700 })),
  Array.from({ length: 14 }, (_, i) => ({ day: addDays(MON, i), eaten: 2000, meal_count: 3 })),
  TODAY)
const anchors = weightSeries([
  { logged_at: new Date(2026, 0, 5, 8).toISOString(), weight_kg: 80 },
  { logged_at: new Date(2026, 0, 12, 8).toISOString(), weight_kg: 79.8 },
], MON, '2026-01-18')
const projection = weeklyProjection(flatDays, anchors)

it('blocks are calendar weeks', () => {
  assert.equal(projection.weeks.length, 2)
  assert.deepEqual([projection.weeks[0].from, projection.weeks[0].to], [MON, '2026-01-11'])
  assert.deepEqual([projection.weeks[1].from, projection.weeks[1].to], ['2026-01-12', '2026-01-18'])
})
it('predicted delta spans exactly what the measurement spans', () => {
  // Week 1 anchors to its own first day, so it covers six days, not seven.
  assert.ok(Math.abs(projection.weeks[0].predictedDeltaKg - (-700 * 6) / KCAL_PER_KG) < 1e-9)
  assert.ok(Math.abs(projection.weeks[1].predictedDeltaKg - (-700 * 7) / KCAL_PER_KG) < 1e-9)
})
it('a block with a measured anchor is marked anchored', () => {
  assert.equal(projection.weeks[0].anchored, true)
  assert.equal(projection.weeks[1].anchored, true)
})
it('week 2 re-anchors to measured weight instead of continuing week 1', () => {
  const week1End = projection.points.find((p) => p.day === '2026-01-11')?.projected as number
  const week2Start = projection.points.find((p) => p.day === '2026-01-12')?.projected as number
  const anchor = anchors.find((p) => p.day === '2026-01-11')?.avg as number
  assert.ok(Math.abs(week2Start - (anchor - 700 / KCAL_PER_KG)) < 1e-9)
  // Without re-anchoring it would have carried on down from week 1's end.
  assert.ok(week2Start > week1End)
})
it('the gap sums the weekly verdicts rather than reading the line ends', () => {
  const weeks = projection.weeks.filter((w) => w.actualDeltaKg !== null)
  const predicted = weeks.reduce((sum, w) => sum + w.predictedDeltaKg, 0)
  const actual = weeks.reduce((sum, w) => sum + (w.actualDeltaKg as number), 0)
  assert.equal(projection.comparedWeeks, weeks.length)
  assert.ok(Math.abs((projection.projectedChangeKg as number) - predicted) < 1e-9)
  assert.ok(Math.abs((projection.actualChangeKg as number) - actual) < 1e-9)
  assert.ok(Math.abs((projection.gapKg as number) - (actual - predicted)) < 1e-9)
})
it('the gap survives re-anchoring instead of being divided by the week count', () => {
  // Calories claim a steep loss; the scale barely moves. A gap read off the
  // re-anchored line would shrink towards one week's worth of that difference.
  const steady = weightSeries(
    Array.from({ length: 14 }, (_, i) => ({
      logged_at: new Date(2026, 0, 5 + i, 8).toISOString(),
      weight_kg: 80,
    })),
    MON, '2026-01-18')
  const p = weeklyProjection(flatDays, steady)
  const claimed = (-700 * 13) / KCAL_PER_KG
  assert.equal(p.actualChangeKg, 0)
  // Predicted must reflect nearly the whole fortnight, not a single week.
  assert.ok((p.projectedChangeKg as number) < claimed * 0.85)
  assert.ok(Math.abs(p.gapKg as number) > Math.abs(claimed) * 0.85)
})
it('an unlogged day advances at the block rate, not at zero', () => {
  const FEB = '2026-02-02'
  const gappy = buildDays(FEB, '2026-02-08',
    [0, 1, 2].map((i) => ({ day: addDays(FEB, i), total_energy: 2700 })),
    [0, 1, 2].map((i) => ({ day: addDays(FEB, i), eaten: 2000, meal_count: 3 })),
    TODAY)
  const w = weightSeries([{ logged_at: new Date(2026, 1, 2, 8).toISOString(), weight_kg: 80 }],
    FEB, '2026-02-08')
  const p = weeklyProjection(gappy, w)
  assert.ok(Math.abs(p.weeks[0].predictedDeltaKg - (-700 * 6) / KCAL_PER_KG) < 1e-9)
  const end = p.points.at(-1)?.projected as number
  assert.ok(Math.abs(end - (80 - (700 * 7) / KCAL_PER_KG)) < 1e-9)
})
it('a block with no weigh-in carries forward and is flagged unanchored', () => {
  const threeWeeks = buildDays(MON, '2026-01-25',
    Array.from({ length: 21 }, (_, i) => ({ day: addDays(MON, i), total_energy: 2700 })),
    Array.from({ length: 21 }, (_, i) => ({ day: addDays(MON, i), eaten: 2000, meal_count: 3 })),
    TODAY)
  const w = weightSeries([{ logged_at: new Date(2026, 0, 5, 8).toISOString(), weight_kg: 80 }],
    MON, '2026-01-25')
  const p = weeklyProjection(threeWeeks, w)
  // The trailing window still covers Jan 5 at the week-2 boundary, so only
  // week 3 runs out of measurements.
  assert.equal(p.weeks[1].anchored, true)
  assert.equal(p.weeks[2].anchored, false)
  assert.ok((p.points.at(-1)?.projected as number) < 79)
})
it('nothing is projected before the first weigh-in', () => {
  const w = weightSeries([{ logged_at: new Date(2026, 0, 16, 8).toISOString(), weight_kg: 80 }],
    MON, '2026-01-18')
  const p = weeklyProjection(flatDays, w)
  assert.equal(p.points[0].projected, null)
  assert.equal(p.points.find((x) => x.day === '2026-01-15')?.projected, null)
})
it('a mid-block weigh-in still starts the line there', () => {
  const w = weightSeries([{ logged_at: new Date(2026, 0, 16, 8).toISOString(), weight_kg: 80 }],
    MON, '2026-01-18')
  const p = weeklyProjection(flatDays, w)
  const started = p.points.find((x) => x.day === '2026-01-16')?.projected as number
  assert.ok(Math.abs(started - (80 - 700 / KCAL_PER_KG)) < 1e-9)
  assert.notEqual(p.points.at(-1)?.projected, null)
})
it('today does not drag the line down by a partial day', () => {
  const upTo = buildDays(addDays(TODAY, -6), TODAY,
    Array.from({ length: 7 }, (_, i) => ({ day: addDays(TODAY, -6 + i), total_energy: 2700 })),
    Array.from({ length: 7 }, (_, i) => ({ day: addDays(TODAY, -6 + i), eaten: 2000, meal_count: 3 })),
    TODAY)
  const w = weightSeries([{ logged_at: new Date(2026, 7, 31, 8).toISOString(), weight_kg: 80 }],
    addDays(TODAY, -6), TODAY)
  const p = weeklyProjection(upTo, w)
  const yesterday = p.points.find((x) => x.day === addDays(TODAY, -1))?.projected
  assert.equal(p.points.at(-1)?.projected, yesterday)
})
it('latest raw weigh-in and its day index are reported', () => {
  assert.equal(projection.latestRaw?.weight, 79.8)
  assert.equal(projection.latestRawDayIndex, 8)
})

it('uses a real minus sign, never a hyphen', () => {
  assert.equal(signedKcal(-1240), '\u22121,240')
  assert.equal(signedKcal(310), '+310')
  assert.equal(signedKcal(0), '0')
  assert.equal(signedKg(-0.65), '\u22120.65 kg')
})
it('range label matches the spec example', () => {
  assert.equal(rangeLabel('2026-08-31', '2026-09-06'), 'Aug 31 \u2013 Sep 6')
})
