import { rangeLabel, signedKcal, signedKg, type PeriodSummary } from '@/lib/trends'

/**
 * Deficit reads negative here exactly as it does on Home. The transparency
 * line matters as much as the number: the average divides by the days that
 * actually have both a sync and a meal, so a week of missed logging shows up
 * as a smaller sample rather than as a quietly diluted average.
 */
export function TrendBanner({ summary }: { summary: PeriodSummary }) {
  const empty = summary.confirmedDays === 0

  return (
    <section className="border-border/70 rounded-xl border p-4">
      <p className="text-muted-foreground text-xs font-medium">Average daily balance</p>
      <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">
        {empty ? '--' : signedKcal(summary.avgNetPerDay)}
        {!empty && <span className="text-muted-foreground ml-1 text-base font-normal">kcal</span>}
      </p>
      <p className="text-muted-foreground mt-1 text-sm">
        {rangeLabel(summary.from, summary.to)}
      </p>
      <p className="text-muted-foreground/80 mt-0.5 text-xs">
        Based on {summary.confirmedDays} of {summary.totalDays} days logged
      </p>
      {!empty && summary.confirmedDays < summary.completedDays && (
        <p className="text-muted-foreground/70 mt-1 text-[11px]">
          Unlogged days are estimated at this rate. Days you skip tend to be the
          heavier ones, so treat the deficit as the optimistic end.
        </p>
      )}

      <div className="border-border/70 mt-3 flex gap-6 border-t pt-3">
        <div>
          <p className="text-muted-foreground text-[11px]">
            Total{summary.confirmedDays < summary.completedDays && ' (est.)'}
          </p>
          <p className="text-sm font-medium tabular-nums">
            {empty ? '--' : `${signedKcal(summary.totalNet)} kcal`}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-[11px]">Implied weight</p>
          <p className="text-sm font-medium tabular-nums">
            {empty ? '--' : signedKg(summary.impliedWeightChangeKg)}
          </p>
        </div>
      </div>
    </section>
  )
}
