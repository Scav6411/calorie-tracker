import { useMemo, useState } from 'react'
import { Bar, BarChart, Cell, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import {
  rangeLabel,
  signedKcal,
  type BucketSize,
  type TrendBucket,
} from '@/lib/trends'

const CHART_CONFIG = {
  eaten: { label: 'Eaten', color: 'var(--brand)' },
  burned: { label: 'Burned', color: 'var(--muted-foreground)' },
} satisfies ChartConfig

/** Roughly how many x labels fit across a phone. */
const MAX_TICKS = 6

interface BarPoint {
  index: number
  label: string
  from: string
  to: string
  eaten: number
  /** Negative so the bar hangs below the zero line. */
  burned: number
  net: number
  confirmedDays: number
  dayCount: number
  inProgress: boolean
}

/**
 * Eaten grows up, burned grows down, and the gap between them is the day's
 * net. That orientation is the same one Home uses, which is what keeps a
 * deficit reading as a negative number on both screens.
 */
export function CaloriesInOutChart({
  buckets,
  bucket,
}: {
  buckets: TrendBucket[]
  bucket: BucketSize
}) {
  const [active, setActive] = useState<number | null>(null)

  const data = useMemo<BarPoint[]>(
    () =>
      buckets.map((entry, index) => ({
        index,
        label: entry.label,
        from: entry.from,
        to: entry.to,
        eaten: entry.avgEaten,
        burned: -entry.avgBurned,
        net: entry.avgNet,
        confirmedDays: entry.confirmedDays,
        dayCount: entry.dayCount,
        inProgress: entry.inProgress,
      })),
    [buckets],
  )

  const bound = useMemo(() => {
    const peak = Math.max(
      500,
      ...data.map((point) => Math.max(point.eaten, Math.abs(point.burned))),
    )
    return Math.ceil((peak * 1.15) / 250) * 250
  }, [data])

  const selected = active !== null ? data[active] : null
  const tickInterval = Math.max(0, Math.ceil(data.length / MAX_TICKS) - 1)

  return (
    <section className="border-border/70 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-medium">Calories in and out</h2>
        <div className="text-muted-foreground flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="bg-brand size-2 rounded-full" aria-hidden />
            Eaten
          </span>
          <span className="flex items-center gap-1.5">
            <span className="bg-muted-foreground size-2 rounded-full" aria-hidden />
            Burned
          </span>
        </div>
      </div>

      {/* Fixed-height readout so selecting a bar never reflows the chart. */}
      <div className="mt-2 h-9">
        {selected ? (
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-medium">
              {bucket === 'day' ? selected.label : rangeLabel(selected.from, selected.to)}
              {selected.inProgress && (
                <span className="text-muted-foreground font-normal"> {'·'} in progress</span>
              )}
            </p>
            <p className="text-muted-foreground text-[11px] tabular-nums">
              {Math.round(selected.eaten).toLocaleString('en-US')} in {'·'}{' '}
              {Math.round(Math.abs(selected.burned)).toLocaleString('en-US')} out {'·'}{' '}
              <span className="text-foreground font-medium">{signedKcal(selected.net)}</span>
              {bucket !== 'day' && <span> / day</span>}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground/70 text-[11px]">Tap a bar to inspect it.</p>
        )}
        {selected && selected.confirmedDays < selected.dayCount && (
          <p className="text-muted-foreground/70 text-[11px]">
            Averaged over {selected.confirmedDays} of {selected.dayCount} days logged
          </p>
        )}
      </div>

      <ChartContainer config={CHART_CONFIG} className="aspect-auto h-44 w-full">
        <BarChart
          data={data}
          margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
          onClick={(state) => {
            // Recharts widened this to string | number | null; only a real
            // index means a bar was actually hit.
            const next = Number(state?.activeTooltipIndex)
            if (!Number.isInteger(next)) return
            setActive((current) => (current === next ? null : next))
          }}
        >
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            interval={tickInterval}
            minTickGap={4}
          />
          <YAxis
            width={34}
            domain={[-bound, bound]}
            ticks={[-bound, 0, bound]}
            // The lower half is drawn negative, but it is still calories burned.
            tickFormatter={(value: number) => String(Math.abs(value) / 1000) + 'k'}
            tickLine={false}
            axisLine={false}
          />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Bar dataKey="eaten" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {data.map((point) => (
              <Cell
                key={point.index}
                fill="var(--color-eaten)"
                fillOpacity={fillFor(point, active)}
                stroke={point.inProgress ? 'var(--color-eaten)' : undefined}
                strokeDasharray={point.inProgress ? '2 2' : undefined}
              />
            ))}
          </Bar>
          <Bar dataKey="burned" radius={[0, 0, 2, 2]} isAnimationActive={false}>
            {data.map((point) => (
              <Cell
                key={point.index}
                fill="var(--color-burned)"
                fillOpacity={fillFor(point, active)}
                stroke={point.inProgress ? 'var(--color-burned)' : undefined}
                strokeDasharray={point.inProgress ? '2 2' : undefined}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </section>
  )
}

/** Today stays faded, and picking a bar dims the rest rather than recolouring it. */
function fillFor(point: BarPoint, active: number | null) {
  if (point.inProgress) return active === point.index ? 0.45 : 0.28
  if (active === null) return 1
  return active === point.index ? 1 : 0.35
}
