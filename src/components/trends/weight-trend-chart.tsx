import { useMemo } from 'react'
import { CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import {
  shortDate,
  signedKg,
  type ProjectionResult,
  type WeightPoint,
} from '@/lib/trends'

const CHART_CONFIG = {
  // Amber against violet: far enough apart in hue that the two lines stay
  // distinguishable even where they overlap, which greys never managed.
  avg: { label: 'Actual (7-day avg)', color: 'var(--trend-actual)' },
  projected: { label: 'Projected', color: 'var(--trend-projected)' },
  // Raw dots share the actual line's hue - they are the same measurement,
  // just unsmoothed - and sit back a little so the line still leads.
  raw: { label: 'Logged entry', color: 'var(--trend-actual)' },
} satisfies ChartConfig

const MAX_TICKS = 5

interface WeightRow {
  day: string
  label: string
  raw: number | null
  avg: number | null
  /** Split in two so a week with no weigh-in can be drawn differently. */
  projected: number | null
  projectedLoose: number | null
}

/**
 * Raw weigh-ins stay as bare dots - no interpolation across days you did not
 * step on the scale. The line through them is a trailing average, and the
 * projection beside it is re-anchored to that average every week so a bad
 * week reads as a bad week rather than as permanent drift.
 */
export function WeightTrendChart({
  weights,
  projection,
  goalWeightKg,
}: {
  weights: WeightPoint[]
  projection: ProjectionResult
  goalWeightKg: number | null
}) {
  const data = useMemo<WeightRow[]>(() => {
    const projectedBy = new Map(projection.points.map((point) => [point.day, point]))

    return weights.map((point, index) => {
      const entry = projectedBy.get(point.day)
      const value = entry?.projected ?? null
      const anchored = entry?.anchored ?? true
      // The boundary point belongs to both segments, otherwise the two lines
      // would show a one-day hole where the anchoring changes.
      const nextLoose = projectedBy.get(weights[index + 1]?.day ?? '')
      const bridging = anchored && nextLoose?.anchored === false

      return {
        day: point.day,
        label: shortDate(point.day),
        raw: point.raw,
        avg: point.avg,
        projected: anchored ? value : null,
        projectedLoose: !anchored || bridging ? value : null,
      }
    })
  }, [weights, projection])

  /**
   * Scaled to the lines alone. Folding the goal into the range was flattening
   * everything: a goal several kilos away turned a week's real movement into a
   * horizontal smudge. The goal is a destination, not part of the data.
   */
  const domain = useMemo(() => {
    const values = data
      .flatMap((row) => [row.raw, row.avg, row.projected, row.projectedLoose])
      .filter((value): value is number => value != null)
    if (!values.length) return undefined

    const lower = Math.min(...values)
    const upper = Math.max(...values)
    // Proportional headroom, floored so a near-flat week still gets a little
    // air, and capped so a year of real movement is not padded into a smaller
    // apparent slope.
    const pad = Math.min(0.8, Math.max(0.15, (upper - lower) * 0.12))
    return [Math.floor((lower - pad) * 10) / 10, Math.ceil((upper + pad) * 10) / 10]
  }, [data])

  // Only drawn when it happens to fall inside the zoomed window; otherwise it
  // moves to the caption so the number is still there without costing scale.
  const goalInView =
    goalWeightKg != null && domain != null && goalWeightKg >= domain[0] && goalWeightKg <= domain[1]

  const unanchored = projection.weeks.filter((week) => !week.anchored).length
  const tickInterval = Math.max(0, Math.ceil(data.length / MAX_TICKS) - 1)
  const hasSeries = data.some((row) => row.avg != null)

  return (
    <section className="border-border/70 rounded-xl border p-4">
      <h2 className="text-sm font-medium">Weight</h2>

      <div className="mt-3 flex gap-6">
        <Figure label="Actual" value={projection.actualChangeKg} />
        <Figure label="Projected" value={projection.projectedChangeKg} />
        <Figure label="Gap" value={projection.gapKg} />
      </div>

      <p className="text-muted-foreground/80 mt-1 text-[11px]">
        {projection.comparedWeeks > 0
          ? `Compared week by week across ${projection.comparedWeeks} week${projection.comparedWeeks > 1 ? 's' : ''}`
          : 'Not enough weigh-ins to compare a week yet'}
      </p>

      <p className="text-muted-foreground mt-2 text-xs">
        {projection.latestRaw
          ? `Day ${projection.latestRawDayIndex} · Logged ${projection.latestRaw.weight.toFixed(1)} kg`
          : 'No weigh-ins in this period'}
        {!goalInView && goalWeightKg != null && ` · Goal ${goalWeightKg.toFixed(1)} kg`}
        {unanchored > 0 && ` · ${unanchored} week${unanchored > 1 ? 's' : ''} unanchored`}
      </p>

      <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="bg-trend-actual h-0.5 w-4 rounded-full" aria-hidden />
          Actual (7-day avg)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-trend-projected h-0.5 w-4 rounded-full" aria-hidden />
          Projected
        </span>
        <span className="flex items-center gap-1.5">
          <span className="bg-trend-actual/60 size-1.5 rounded-full" aria-hidden />
          Logged entry
        </span>
      </div>

      {hasSeries ? (
        <ChartContainer config={CHART_CONFIG} className="mt-2 aspect-auto h-44 w-full">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.4} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              interval={tickInterval}
              minTickGap={4}
            />
            <YAxis
              width={38}
              domain={domain ?? ['auto', 'auto']}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => value.toFixed(1)}
            />
            {goalInView && goalWeightKg != null && (
              <ReferenceLine
                y={goalWeightKg}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
                strokeOpacity={0.6}
                label={{
                  value: `Goal ${goalWeightKg.toFixed(1)}`,
                  position: 'insideBottomRight',
                  fill: 'var(--muted-foreground)',
                  fontSize: 10,
                }}
              />
            )}
            {/* Stroke omitted: this series exists only to place the dots. */}
            <Line
              dataKey="raw"
              stroke="none"
              isAnimationActive={false}
              dot={{ r: 2.2, fill: 'var(--color-raw)', fillOpacity: 0.55, stroke: 'none' }}
              activeDot={false}
              connectNulls={false}
            />
            <Line
              dataKey="projectedLoose"
              stroke="var(--color-projected)"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              strokeOpacity={0.55}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              dataKey="projected"
              stroke="var(--color-projected)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              dataKey="avg"
              stroke="var(--color-avg)"
              strokeWidth={2.4}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          </ComposedChart>
        </ChartContainer>
      ) : (
        <div className="text-muted-foreground/70 flex h-44 items-center justify-center text-xs">
          Log your weight to see a trend here.
        </div>
      )}
    </section>
  )
}

function Figure({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <p className="text-lg font-semibold tracking-tight tabular-nums">
        {value == null ? '--' : signedKg(value)}
      </p>
    </div>
  )
}
