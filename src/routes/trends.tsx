import { useState } from 'react'
import { ScreenHeader, ScreenTitle } from '@/components/layout/screen-header'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendPeriodFilter } from '@/components/trends/trend-period-filter'
import { TrendBanner } from '@/components/trends/trend-banner'
import { CaloriesInOutChart } from '@/components/trends/calories-in-out-chart'
import { WeightTrendChart } from '@/components/trends/weight-trend-chart'
import { useAuth } from '@/hooks/use-auth'
import { useTrends } from '@/hooks/use-trends'
import { rangeLabel, type TrendRange } from '@/lib/trends'

export function TrendsPage({ demo = false }: { demo?: boolean }) {
  const { session } = useAuth()
  const [range, setRange] = useState<TrendRange>('7D')
  const trends = useTrends(range, Boolean(session), demo)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 pb-3">
      <ScreenHeader>
        <ScreenTitle eyebrow={rangeLabel(trends.from, trends.to)} title="Trends" />
      </ScreenHeader>

      <TrendPeriodFilter value={range} onChange={setRange} />

      {/* Home is pinned to one viewport; Trends genuinely has more than fits,
          so this column scrolls while the header, filter and tab bar stay put. */}
      <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {trends.error && (
          <p className="border-border/70 text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
            {trends.error}
          </p>
        )}

        {trends.loading ? (
          <>
            <Skeleton className="h-44 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
            <Skeleton className="h-72 w-full rounded-xl" />
          </>
        ) : (
          <>
            <TrendBanner summary={trends.summary} />
            <CaloriesInOutChart buckets={trends.buckets} bucket={trends.bucket} />
            <WeightTrendChart
              weights={trends.weights}
              projection={trends.projection}
              goalWeightKg={trends.goalWeightKg}
            />
          </>
        )}
      </div>
    </div>
  )
}
