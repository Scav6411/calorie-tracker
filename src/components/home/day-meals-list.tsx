import { Skeleton } from '@/components/ui/skeleton'
import type { MealLog } from '@/lib/meals'

const TIME = new Intl.DateTimeFormat('en-GB', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

/**
 * The day's meals, in the space the timeline chart otherwise occupies. Scrolls
 * internally so Home itself stays pinned to one viewport.
 */
export function DayMealsList({
  logs,
  loading,
  error,
  isToday,
  onSelect,
}: {
  logs: MealLog[]
  loading: boolean
  error: string | null
  isToday: boolean
  onSelect: (log: MealLog) => void
}) {
  if (loading) {
    return (
      <div className="space-y-2 pt-1">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-13 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (error || logs.length === 0) {
    return (
      <div className="border-border/70 text-muted-foreground flex h-full items-center justify-center rounded-xl border border-dashed p-4 text-center text-sm">
        {error ?? `Nothing logged ${isToday ? 'yet today' : 'on this day'}.`}
      </div>
    )
  }

  return (
    // overscroll-contain stops iOS chaining this scroll to the page behind it.
    <ul className="divide-border/60 h-full divide-y overflow-y-auto overscroll-contain">
      {logs.map((log) => (
        <li key={log.id}>
          <button
            type="button"
            onClick={() => onSelect(log)}
            className="hover:bg-muted/50 flex w-full items-center gap-3 rounded-md px-1 py-2 text-left"
          >
            <span className="text-muted-foreground w-14 shrink-0 text-xs tabular-nums">
              {TIME.format(new Date(log.logged_at))}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{log.name}</span>
              <span className="text-muted-foreground block truncate text-[11px] capitalize">
                {log.quantity} {log.unit} {'\u00b7'} {log.meal_tag}
              </span>
            </span>
            <span className="shrink-0 text-sm font-medium tabular-nums">
              {Math.round(log.calories)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
