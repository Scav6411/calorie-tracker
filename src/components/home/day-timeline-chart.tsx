import { Bar, BarChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { HourlyBurn } from '@/lib/energy'
import type { DayEntry } from '@/lib/mock-data'

const CHART_CONFIG = {
  eaten: { label: 'Eaten', color: 'var(--brand)' },
  active: { label: 'Active burn', color: 'var(--muted-foreground)' },
  resting: { label: 'Resting burn', color: 'var(--border)' },
} satisfies ChartConfig

// The whole day. Resting burn is recorded every hour including while asleep,
// so starting at 05:00 - which made sense when the early hours were empty -
// now folds real overnight readings into the 5am bar.
const DAY_START = 0
const DAY_END = 23

const ALL_HOURS = Array.from({ length: DAY_END - DAY_START + 1 }, (_, index) => DAY_START + index)

/**
 * Width each hour gets, in px. Twenty-four hours share about 340px on a phone,
 * which is 14px an hour - too narrow for a pair of bars and a label, and no
 * rearranging fixes that. So the chart is drawn at the width it needs and
 * scrolled sideways instead of being squeezed into the screen.
 */
const HOUR_WIDTH = 36

interface HourPoint {
  hour: number
  eaten: number
  active: number
  resting: number
}

/**
 * 24-hour clock on the axis. Every hour is labelled, so "13" fits where "1p"
 * would not, and it cannot be misread as 1am.
 */
function axisHour(value: number) {
  return String(Math.round(value))
}

function shortHour(value: number) {
  const hour = Math.round(value)
  const suffix = hour >= 12 ? 'p' : 'a'
  return `${hour % 12 === 0 ? 12 : hour % 12}${suffix}`
}

function hourRange(hour: number) {
  const to = (hour + 1) % 24
  return `${shortHour(hour)}-${shortHour(to)}`
}

/**
 * One bar per local hour: calories eaten above the line, calories burned below
 * it, split into the active portion and the resting baseline.
 */
export function DayTimelineChart({
  meals,
  hourly,
}: {
  meals: DayEntry[]
  hourly: HourlyBurn[]
}) {
  const byHour = new Map<number, HourPoint>()
  const pointFor = (hour: number) => {
    const clamped = Math.min(DAY_END, Math.max(DAY_START, hour))
    let point = byHour.get(clamped)
    if (!point) {
      point = { hour: clamped, eaten: 0, active: 0, resting: 0 }
      byHour.set(clamped, point)
    }
    return point
  }

  for (const meal of meals) {
    if (meal.kcal > 0) pointFor(Math.floor(meal.at)).eaten += meal.kcal
  }
  for (const burn of hourly) {
    const point = pointFor(burn.hour)
    // Negative so the bars grow downwards from the zero line.
    point.active -= burn.active
    point.resting -= burn.resting
  }

  const data = [...byHour.values()].sort((a, b) => a.hour - b.hour)

  const peak = Math.max(
    300,
    ...data.map((point) => Math.max(point.eaten, Math.abs(point.active + point.resting))),
  )
  const bound = Math.ceil((peak * 1.2) / 50) * 50

  return (
    <div className="h-full w-full overflow-x-auto overflow-y-hidden overscroll-x-contain">
      <div className="h-full" style={{ minWidth: `${ALL_HOURS.length * HOUR_WIDTH}px` }}>
        <ChartContainer config={CHART_CONFIG} className="aspect-auto h-full w-full">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barGap={2}>
            <XAxis
              dataKey="hour"
              type="number"
              domain={[DAY_START, DAY_END]}
              ticks={ALL_HOURS}
              interval={0}
              tickFormatter={axisHour}
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickMargin={4}
            />
            <YAxis hide domain={[-bound, bound]} />
            <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="2 3" />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const point = payload?.[0]?.payload as HourPoint | undefined
                    return point ? hourRange(point.hour) : ''
                  }}
                  formatter={(value, name) => `${CHART_CONFIG[name as keyof typeof CHART_CONFIG]?.label ?? name}: ${Math.abs(Number(value))} kcal`}
                />
              }
            />
            <Bar dataKey="eaten" fill="var(--color-eaten)" barSize={13} radius={2} isAnimationActive={false} />
            <Bar dataKey="resting" stackId="burn" fill="var(--color-resting)" barSize={13} isAnimationActive={false} />
            <Bar dataKey="active" stackId="burn" fill="var(--color-active)" barSize={13} radius={2} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  )
}
