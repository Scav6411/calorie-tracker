// Period, bucketing and projection math for Trends. Deliberately free of any
// I/O so the awkward cases - missing days, sparse weigh-ins, an unanchored
// week - can be unit-tested directly.
//
// Sign convention matches Home: net = eaten - burned, so a deficit is
// NEGATIVE. That falls out nicely for the projection, where a negative net
// divided by KCAL_PER_KG is already a weight decrease.

/** Energy in one kilogram of body mass, the usual dieting approximation. */
export const KCAL_PER_KG = 7700

export type TrendRange = '7D' | '1M' | '6M' | '1Y'
export type BucketSize = 'day' | 'week' | 'month'

export const TREND_RANGES: TrendRange[] = ['7D', '1M', '6M', '1Y']

export const RANGE_DAYS: Record<TrendRange, number> = {
  '7D': 7,
  '1M': 30,
  '6M': 182,
  '1Y': 365,
}

/** Bucket width per range, following how Apple Health thins its bars. */
export const RANGE_BUCKET: Record<TrendRange, BucketSize> = {
  '7D': 'day',
  '1M': 'day',
  '6M': 'week',
  '1Y': 'month',
}

/** Days per projection block. Weekly re-anchoring keeps drift from compounding. */
export const BLOCK_DAYS = 7

// ---------------------------------------------------------------------------
// Day keys
// ---------------------------------------------------------------------------

/**
 * Parses YYYY-MM-DD at local noon. Midnight would let a DST shift push the
 * date onto the previous day in timezones that spring forward at 00:00.
 */
export function parseDayKey(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

/**
 * Browser-local, which is the same day the `daily_energy` and `daily_intake`
 * views produce only while the browser sits in the profile's timezone. That
 * holds by decision rather than by construction: the profile is Asia/Kolkata,
 * India has no DST, and reconciling the two was judged not worth it. If the
 * browser ever runs in another zone the two disagree silently - a finished day
 * can be averaged in half-complete, and weight anchors slip by a day.
 */
export function dayKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function addDays(key: string, delta: number) {
  const date = parseDayKey(key)
  date.setDate(date.getDate() + delta)
  return dayKey(date)
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string) {
  return Math.round((parseDayKey(to).getTime() - parseDayKey(from).getTime()) / 86_400_000)
}

/** Monday of the calendar week containing `key`. */
export function weekStart(key: string) {
  const date = parseDayKey(key)
  return addDays(key, -((date.getDay() + 6) % 7))
}

/** First day of the calendar month containing `key`. */
export function monthStart(key: string) {
  return `${key.slice(0, 7)}-01`
}

/**
 * The window ends today, so the in-progress day is always the last one.
 *
 * The two long ranges snap their start to a bucket boundary. A rolling 365-day
 * window touches thirteen calendar months and a rolling 182-day window cuts
 * two weeks in half, which made the bar count wobble with the weekday and left
 * runt bars at the edges.
 */
export function periodBounds(range: TrendRange, today: string) {
  // 26 weekly bars, the last being the week in progress.
  if (range === '6M') return { from: addDays(weekStart(today), -25 * 7), to: today }
  // 12 monthly bars, the last being the month in progress.
  if (range === '1Y') {
    const date = parseDayKey(today)
    const start = new Date(date.getFullYear(), date.getMonth() - 11, 1, 12, 0, 0, 0)
    return { from: dayKey(start), to: today }
  }
  return { from: addDays(today, -(RANGE_DAYS[range] - 1)), to: today }
}

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

export interface DailyEnergyRow {
  day: string
  total_energy: number
}

export interface DailyIntakeRow {
  day: string
  eaten: number
  meal_count: number
}

export interface DayPoint {
  day: string
  burned: number
  eaten: number
  /** eaten - burned. Negative is a deficit. */
  net: number
  hasEnergy: boolean
  mealCount: number
  /**
   * A finished day with both a Health sync and at least one meal. Only
   * confirmed days feed the averages - a day with burn but no meals is far
   * more likely to be an unlogged day than a genuine fast.
   */
  confirmed: boolean
  /** Today: real but incomplete, so it is drawn faded and never averaged. */
  inProgress: boolean
}

/**
 * Densifies the two sparse server rollups into one row per calendar day, so
 * gaps stay visible as gaps rather than collapsing the axis.
 */
export function buildDays(
  from: string,
  to: string,
  energy: DailyEnergyRow[],
  intake: DailyIntakeRow[],
  today: string,
): DayPoint[] {
  const burnedBy = new Map(energy.map((row) => [row.day, Number(row.total_energy) || 0]))
  const intakeBy = new Map(intake.map((row) => [row.day, row]))

  const points: DayPoint[] = []
  const span = daysBetween(from, to)

  for (let offset = 0; offset <= span; offset += 1) {
    const day = addDays(from, offset)
    const hasEnergy = burnedBy.has(day)
    const eatenRow = intakeBy.get(day)
    const burned = burnedBy.get(day) ?? 0
    const eaten = Number(eatenRow?.eaten ?? 0)
    const mealCount = Number(eatenRow?.meal_count ?? 0)
    const inProgress = day === today

    points.push({
      day,
      burned,
      eaten,
      net: eaten - burned,
      hasEnergy,
      mealCount,
      confirmed: hasEnergy && mealCount >= 1 && !inProgress && day <= today,
      inProgress,
    })
  }

  return points
}

export interface PeriodSummary {
  from: string
  to: string
  confirmedDays: number
  totalDays: number
  /** Days in the window that have finished. Excludes today. */
  completedDays: number
  /** Raw sum over confirmed days - what was actually observed. */
  loggedNet: number
  /** Divided by the confirmed count, never by the calendar length. */
  avgNetPerDay: number
  /** The observed rate carried across every completed day in the window. */
  totalNet: number
  impliedWeightChangeKg: number
}

/**
 * Missing days are estimated at the observed rate, matching how the projection
 * already fills its gaps. Summing only the confirmed days and calling it the
 * period total was the same "treat a gap as zero" mistake, moved from the
 * average into the total: with 141 of 182 days logged it understated a real
 * 9.77 kg of loss as 7.53 kg.
 */
export function summarisePeriod(days: DayPoint[]): PeriodSummary {
  const confirmed = days.filter((day) => day.confirmed)
  const loggedNet = confirmed.reduce((sum, day) => sum + day.net, 0)
  const avgNetPerDay = confirmed.length ? loggedNet / confirmed.length : 0
  const completedDays = days.filter((day) => !day.inProgress).length
  const totalNet = avgNetPerDay * completedDays

  return {
    from: days[0]?.day ?? '',
    to: days.at(-1)?.day ?? '',
    confirmedDays: confirmed.length,
    totalDays: days.length,
    completedDays,
    loggedNet,
    avgNetPerDay,
    totalNet,
    impliedWeightChangeKg: totalNet / KCAL_PER_KG,
  }
}

// ---------------------------------------------------------------------------
// Bucketing
// ---------------------------------------------------------------------------

export interface TrendBucket {
  key: string
  label: string
  from: string
  to: string
  /** Sums over the days that actually count towards this bucket. */
  eaten: number
  burned: number
  net: number
  /**
   * Per-day means. Bars are drawn from these rather than the sums so that a
   * week with three logged days is not shorter than a week with seven, and so
   * every range shares one kcal-per-day axis.
   */
  avgEaten: number
  avgBurned: number
  avgNet: number
  /** Days behind the means: confirmed days, or today alone for today's bar. */
  countedDays: number
  confirmedDays: number
  dayCount: number
  /** Contains today, so the bar is only partly filled in. */
  inProgress: boolean
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-09-06" -> "Sep 6". */
export function shortDate(key: string) {
  const date = parseDayKey(key)
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`
}

/**
 * Keyed by the calendar so a given date always lands in the same bucket, no
 * matter which range is on screen or which day you happen to be looking.
 */
function bucketKeyFor(day: string, bucket: BucketSize) {
  if (bucket === 'day') return day
  if (bucket === 'month') return day.slice(0, 7)
  return weekStart(day)
}

function labelFor(bucket: BucketSize, from: string) {
  if (bucket === 'month') {
    const date = parseDayKey(from)
    return MONTHS[date.getMonth()]
  }
  return shortDate(from)
}

export function bucketDays(days: DayPoint[], bucket: BucketSize): TrendBucket[] {
  if (!days.length) return []
  const order: string[] = []
  const groups = new Map<string, DayPoint[]>()

  for (const day of days) {
    const key = bucketKeyFor(day.day, bucket)
    let group = groups.get(key)
    if (!group) {
      group = []
      groups.set(key, group)
      order.push(key)
    }
    group.push(day)
  }

  return order.map((key) => {
    const group = groups.get(key) ?? []
    const confirmed = group.filter((day) => day.confirmed)
    // Only confirmed days contribute, so a bucket of unlogged days reads as an
    // empty bar rather than as a zero-calorie week. Today is the exception:
    // when it is a bar of its own there is nothing else to draw, so its
    // part-finished totals stand in - and the bar is faded to say so.
    const counted = confirmed.length ? confirmed : group.filter((day) => day.inProgress)
    const eaten = counted.reduce((sum, day) => sum + day.eaten, 0)
    const burned = counted.reduce((sum, day) => sum + day.burned, 0)
    const per = counted.length || 1

    return {
      key,
      label: labelFor(bucket, group[0].day),
      from: group[0].day,
      to: group.at(-1)?.day ?? group[0].day,
      eaten,
      burned,
      net: eaten - burned,
      avgEaten: eaten / per,
      avgBurned: burned / per,
      avgNet: (eaten - burned) / per,
      countedDays: counted.length,
      confirmedDays: confirmed.length,
      dayCount: group.length,
      inProgress: group.some((day) => day.inProgress),
    }
  })
}

// ---------------------------------------------------------------------------
// Weight
// ---------------------------------------------------------------------------

export interface WeightEntry {
  logged_at: string
  weight_kg: number
}

export interface WeightPoint {
  day: string
  /** Mean of whatever was logged that day, or null if nothing was. */
  raw: number | null
  /** Trailing-window mean, defined whenever the window holds any entry. */
  avg: number | null
}

/**
 * Raw dots plus a trailing average. The average lags true weight by about half
 * the window, but that lag cancels when comparing two points a whole window
 * apart - which is exactly how the weekly projection uses it.
 */
export function weightSeries(
  entries: WeightEntry[],
  from: string,
  to: string,
  windowDays = BLOCK_DAYS,
): WeightPoint[] {
  const byDay = new Map<string, number[]>()
  for (const entry of entries) {
    const key = dayKey(new Date(entry.logged_at))
    const list = byDay.get(key)
    if (list) list.push(Number(entry.weight_kg))
    else byDay.set(key, [Number(entry.weight_kg)])
  }

  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
  const points: WeightPoint[] = []
  const span = daysBetween(from, to)

  for (let offset = 0; offset <= span; offset += 1) {
    const day = addDays(from, offset)
    const own = byDay.get(day)

    const window: number[] = []
    for (let back = 0; back < windowDays; back += 1) {
      const values = byDay.get(addDays(day, -back))
      if (values) window.push(...values)
    }

    points.push({
      day,
      raw: own ? mean(own) : null,
      avg: window.length ? mean(window) : null,
    })
  }

  return points
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

export interface ProjectionPoint {
  day: string
  /** Predicted weight, or null before the first usable anchor. */
  projected: number | null
  /** False once a block had to carry the previous block forward uncorrected. */
  anchored: boolean
}

export interface WeekComparison {
  index: number
  from: string
  to: string
  /** What this block's calories predicted, scaled to its full length. */
  predictedDeltaKg: number
  /** Measured change in the trailing average, or null if either end is missing. */
  actualDeltaKg: number | null
  confirmedDays: number
  dayCount: number
  anchored: boolean
}

export interface ProjectionResult {
  points: ProjectionPoint[]
  weeks: WeekComparison[]
  /** Weeks with a measurement at both ends, so both sums cover the same spans. */
  comparedWeeks: number
  /** Measured change, summed over the compared weeks. */
  actualChangeKg: number | null
  /** What those same weeks' calories predicted. */
  projectedChangeKg: number | null
  /** actual - projected. Positive means you are heavier than the maths expected. */
  gapKg: number | null
  /** Latest raw weigh-in inside the period. */
  latestRaw: { day: string; weight: number } | null
  /** 1-based position of that weigh-in within the period. */
  latestRawDayIndex: number | null
}

/**
 * Cumulative net calories converted to kilograms, re-anchored to measured
 * weight every block.
 *
 * Two decisions worth stating:
 *
 * 1. Blocks anchor to the trailing average, not to a single weigh-in. One raw
 *    reading carries a kilogram or more of water noise, and anchoring to it
 *    would make each block start from a random offset.
 * 2. Days inside a block that were never confirmed advance the line at the
 *    block's own mean confirmed rate rather than at zero. Treating a gap as
 *    zero net would quietly assert "no change was predicted here", which
 *    biases every block towards making you look worse than you did.
 */
export function weeklyProjection(
  days: DayPoint[],
  weights: WeightPoint[],
): ProjectionResult {
  const avgByDay = new Map(weights.map((point) => [point.day, point.avg]))
  const points: ProjectionPoint[] = []
  const weeks: WeekComparison[] = []

  // Blocks follow the calendar, not the window. Cutting them from the start of
  // whatever range happens to be on screen meant the same historical week was
  // judged differently depending on the day you opened the app.
  const blocks: DayPoint[][] = []
  for (const day of days) {
    const current = blocks.at(-1)
    if (current && weekStart(current[0].day) === weekStart(day.day)) current.push(day)
    else blocks.push([day])
  }

  let running: number | null = null
  let offset = 0

  for (const [index, block] of blocks.entries()) {
    const boundaryDay = offset === 0 ? block[0].day : days[offset - 1].day
    const boundaryAvg = avgByDay.get(boundaryDay) ?? null
    let anchored = boundaryAvg !== null

    if (boundaryAvg !== null) running = boundaryAvg

    const confirmed = block.filter((day) => day.confirmed)
    const meanNet = confirmed.length
      ? confirmed.reduce((sum, day) => sum + day.net, 0) / confirmed.length
      : 0

    // Cold start: nothing at the boundary and nothing carried in from an
    // earlier block. Rather than blank out a whole block because the first
    // weigh-in happened to land mid-week, begin the line at that weigh-in.
    let firstDrawn = 0
    if (running === null) {
      const found = block.findIndex((day) => (avgByDay.get(day.day) ?? null) !== null)
      if (found >= 0) {
        firstDrawn = found
        running = avgByDay.get(block[found].day) as number
        anchored = true
      }
    }

    for (let position = 0; position < block.length; position += 1) {
      const day = block[position]
      // Today is genuinely incomplete, so it must not drag the line down by a
      // partial day's worth of deficit.
      if (running !== null && position >= firstDrawn && !day.inProgress) {
        const net = day.confirmed ? day.net : meanNet
        running += net / KCAL_PER_KG
      }
      points.push({ day: day.day, projected: position >= firstDrawn ? running : null, anchored })
    }

    const lastDay = block.at(-1)?.day ?? block[0].day
    const endAvg = avgByDay.get(lastDay) ?? null
    // Predict over exactly the span the measurement covers. The first block of
    // a window anchors to its own first day rather than to the day before it,
    // so its span is one day shorter.
    const span = daysBetween(boundaryDay, lastDay)

    weeks.push({
      index,
      from: block[0].day,
      to: lastDay,
      predictedDeltaKg: (meanNet * span) / KCAL_PER_KG,
      actualDeltaKg: endAvg !== null && boundaryAvg !== null ? endAvg - boundaryAvg : null,
      confirmedDays: confirmed.length,
      dayCount: block.length,
      anchored,
    })

    offset += block.length
  }

  /*
   * Adding the weekly verdicts up, rather than reading the projected line's
   * endpoints.
   *
   * The line is deliberately yanked back onto measured weight every week, so
   * over N weeks its start-to-end change is forced to within about one week of
   * the measured change however wrong the calories are. Subtracting its
   * endpoints therefore divides any real disagreement by N: a 30% error in
   * reported burn showed up as 0.75 kg across six months instead of 18 kg.
   *
   * Each week's own predicted-versus-actual pair is untouched by the
   * re-anchoring, so summing those keeps the full disagreement. Weeks missing
   * a measurement at either end drop out of both sums, keeping it like for
   * like.
   */
  const comparable = weeks.filter((week) => week.actualDeltaKg !== null)
  const actualChangeKg = comparable.length
    ? comparable.reduce((sum, week) => sum + (week.actualDeltaKg ?? 0), 0)
    : null
  const projectedChangeKg = comparable.length
    ? comparable.reduce((sum, week) => sum + week.predictedDeltaKg, 0)
    : null

  const rawEntries = weights.filter((point) => point.raw !== null)
  const latest = rawEntries.at(-1)

  return {
    points,
    weeks,
    comparedWeeks: comparable.length,
    actualChangeKg,
    projectedChangeKg,
    gapKg:
      actualChangeKg !== null && projectedChangeKg !== null
        ? actualChangeKg - projectedChangeKg
        : null,
    latestRaw: latest ? { day: latest.day, weight: latest.raw as number } : null,
    latestRawDayIndex:
      latest && weights[0] ? daysBetween(weights[0].day, latest.day) + 1 : null,
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** "-1,240" / "+310" / "0". The minus is a real minus sign, not a hyphen. */
export function signedKcal(value: number) {
  const rounded = Math.round(value)
  if (rounded === 0) return '0'
  const sign = rounded < 0 ? '\u2212' : '+'
  return `${sign}${Math.abs(rounded).toLocaleString('en-US')}`
}

export function signedKg(value: number, digits = 2) {
  const fixed = Number(value.toFixed(digits))
  if (fixed === 0) return `0.${'0'.repeat(digits)} kg`
  const sign = fixed < 0 ? '\u2212' : '+'
  return `${sign}${Math.abs(fixed).toFixed(digits)} kg`
}

/** "Aug 31 \u2013 Sep 6", using an en dash. */
export function rangeLabel(from: string, to: string) {
  return `${shortDate(from)} \u2013 ${shortDate(to)}`
}
