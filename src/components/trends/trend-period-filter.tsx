import { cn } from '@/lib/utils'
import { TREND_RANGES, type TrendRange } from '@/lib/trends'

/** One control for the whole page - every section reads the same period. */
export function TrendPeriodFilter({
  value,
  onChange,
}: {
  value: TrendRange
  onChange: (range: TrendRange) => void
}) {
  return (
    <div role="tablist" aria-label="Period" className="bg-muted/60 flex shrink-0 rounded-lg p-0.5">
      {TREND_RANGES.map((range) => (
        <button
          key={range}
          type="button"
          role="tab"
          aria-selected={value === range}
          onClick={() => onChange(range)}
          className={cn(
            'flex-1 rounded-md py-1.5 text-xs font-medium transition-colors',
            value === range ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
          )}
        >
          {range}
        </button>
      ))}
    </div>
  )
}
