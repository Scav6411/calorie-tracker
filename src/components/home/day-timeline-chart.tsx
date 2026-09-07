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

const DAY_START = 5
const DAY_END = 23

interface HourPoint {
  hour: number
  eaten: number
  active: number
  resting: number
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
    <ChartContainer config={CHART_CONFIG} className="aspect-auto h-full w-full">
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <XAxis
          dataKey="hour"
          type="number"
          domain={[DAY_START, DAY_END]}
          ticks={[6, 9, 12, 15, 18, 21]}
          tickFormatter={shortHour}
          tickLine={false}
          axisLine={false}
          tickMargin={6}
        />
        <YAxis hide domain={[-bound, bound]} />
        <ReferenceLine y={0} stroke="var(--border)" />
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
        <Bar dataKey="eaten" fill="var(--color-eaten)" barSize={9} radius={2} isAnimationActive={false} />
        <Bar dataKey="resting" stackId="burn" fill="var(--color-resting)" barSize={9} isAnimationActive={false} />
        <Bar dataKey="active" stackId="burn" fill="var(--color-active)" barSize={9} radius={2} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  )
}
