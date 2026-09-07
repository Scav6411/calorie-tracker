import { Loader2, Plus } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { RecentFood } from '@/lib/meals'

/**
 * One tap re-logs a food exactly as it was logged last time - same quantity,
 * unit, calories and meal tag - stamped at the current time.
 *
 * The whole card is the button rather than just the plus: a nested button would
 * be invalid HTML, and the bigger target is easier to hit one-handed.
 */
export function LogAgain({
  items,
  loading = false,
  pendingKey = null,
  onAdd,
}: {
  items: RecentFood[]
  loading?: boolean
  /** Key of the card mid-write; only one can be in flight at a time. */
  pendingKey?: string | null
  onAdd: (item: RecentFood) => void
}) {
  // Nothing logged yet and nothing on the way: give the space to the timeline.
  if (!loading && items.length === 0) return null

  return (
    <section className="shrink-0 space-y-3">
      <h2 className="text-muted-foreground text-xs font-medium">Log again</h2>
      {/* Edge-to-edge scroller: negative margin lets cards bleed past the page gutter. */}
      <div className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5">
        {loading
          ? [0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-14 w-36 shrink-0 rounded-xl" />
            ))
          : items.map((item) => {
              const busy = pendingKey === item.food_key
              return (
                <button
                  key={item.food_key}
                  type="button"
                  onClick={() => onAdd(item)}
                  disabled={busy}
                  aria-busy={busy}
                  aria-label={`Log ${item.name} again`}
                  className="border-border/70 bg-card active:bg-muted/60 flex max-w-[11rem] shrink-0 snap-start items-center gap-3 rounded-xl border py-2.5 pr-2.5 pl-3.5 text-left transition-colors disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item.name}</span>
                    <span className="text-muted-foreground block truncate text-xs tabular-nums">
                      {Math.round(item.calories)} kcal {'\u00b7'} {item.quantity} {item.unit}
                    </span>
                  </span>
                  <span className="bg-secondary text-secondary-foreground flex size-7 shrink-0 items-center justify-center rounded-full">
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Plus className="size-4" aria-hidden />
                    )}
                  </span>
                </button>
              )
            })}
      </div>
    </section>
  )
}
