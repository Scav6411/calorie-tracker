// Placeholder data so the screens can be built and reviewed before the
// entries schema exists. Everything here is replaced by Supabase queries later.

export type EntryKind = 'meal' | 'activity'

export interface DayEntry {
  id: string
  kind: EntryKind
  title: string
  /** e.g. "Breakfast - 8:12 am" */
  detail: string
  /** Hour of the day as a decimal, e.g. 8.2 is 8:12 am. Drives the x-axis. */
  at: number
  /** Positive = consumed, negative = burned. */
  kcal: number
}

export interface QuickLogItem {
  id: string
  title: string
  kcal: number
}

export interface DaySummary {
  date: Date
  eaten: number
  burned: number
  /** Where the burn figure came from, shown under the totals. */
  burnSource: string
}


export const MOCK_QUICK_LOG: QuickLogItem[] = [
  { id: 'q1', title: 'Oats + banana', kcal: 320 },
  { id: 'q2', title: 'Chicken + rice', kcal: 540 },
  { id: 'q3', title: 'Protein shake', kcal: 160 },
  { id: 'q4', title: 'Paneer wrap', kcal: 430 },
]

/** "8.2" -> "8:12 am". Used by the chart axis and tooltip. */
export function formatHour(value: number) {
  const hour = Math.floor(value)
  const minute = Math.round((value - hour) * 60)
  const suffix = hour >= 12 ? 'pm' : 'am'
  const display = hour % 12 === 0 ? 12 : hour % 12
  return `${display}:${String(minute).padStart(2, '0')} ${suffix}`
}

export function toDayKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function isSameDay(a: Date, b: Date) {
  return toDayKey(a) === toDayKey(b)
}

const SHORT_DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

/** "Today" / "Yesterday" / "6 Sep". */
export function relativeDayLabel(date: Date) {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (isSameDay(date, today)) return 'Today'
  if (isSameDay(date, yesterday)) return 'Yesterday'
  return SHORT_DAY.format(date)
}

/** Net calories for the day: negative is a deficit, positive is a surplus. */
export function netCalories(summary: DaySummary) {
  return summary.eaten - summary.burned
}
