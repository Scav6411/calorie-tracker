import { BalanceBar } from './balance-bar'
import { netCalories, type DaySummary } from '@/lib/mock-data'

export function DaySummaryCard({ summary }: { summary: DaySummary }) {
  const net = Math.round(netCalories(summary))
  const balance = net === 0 ? 'balanced' : net < 0 ? 'deficit' : 'surplus'

  return (
    <section className="space-y-4">
      <div className="text-center">
        <p className="text-[2.75rem] leading-none font-semibold tracking-tight tabular-nums">
          {net === 0 ? '' : net < 0 ? '−' : '+'}
          {Math.abs(net).toLocaleString()}
        </p>
        <p className="text-muted-foreground mt-1.5 text-sm">
          kcal {balance} today
        </p>
      </div>

      <BalanceBar value={net} />

      <div className="space-y-1 text-center">
        <p className="text-sm">
          <span className="text-muted-foreground">Eaten </span>
          <span className="font-medium tabular-nums">{Math.round(summary.eaten).toLocaleString()}</span>
          <span className="text-muted-foreground"> Burned </span>
          <span className="font-medium tabular-nums">{Math.round(summary.burned).toLocaleString()}</span>
        </p>
        <p className="text-muted-foreground text-xs">{summary.burnSource}</p>
      </div>
    </section>
  )
}
