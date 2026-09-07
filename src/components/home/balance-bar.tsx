/** Full-scale of the bar in either direction, in kcal. */
const RANGE = 1200

/** Zero sits at the midpoint of the track. */
const CENTER = 50

/**
 * Shows where the day sits between deficit (left) and surplus (right).
 * `value` is net calories: negative ate less than it burned.
 *
 * The fill is anchored at zero and grows outwards, so its length reads as the
 * size of the imbalance and its side reads as the direction.
 */
export function BalanceBar({ value }: { value: number }) {
  const clamped = Math.max(-RANGE, Math.min(RANGE, value))
  const percent = ((clamped + RANGE) / (RANGE * 2)) * 100
  const fillLeft = Math.min(percent, CENTER)
  const fillWidth = Math.abs(percent - CENTER)

  return (
    <div className="space-y-2">
      <div
        className="bg-secondary relative h-1.5 w-full rounded-full"
        role="meter"
        aria-valuemin={-RANGE}
        aria-valuemax={RANGE}
        aria-valuenow={clamped}
        aria-label="Calorie balance"
      >
        <div
          className="bg-foreground/70 absolute inset-y-0 rounded-full transition-all duration-500"
          style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
        />
        {/* Zero mark: the break-even point the fill grows out from. */}
        <span
          className="bg-background/90 absolute top-1/2 left-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          aria-hidden
        />
        <span
          className="bg-foreground ring-background absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 transition-[left] duration-500"
          style={{ left: `${percent}%` }}
        />
      </div>
      <div className="text-muted-foreground grid grid-cols-3 text-[11px]">
        <span className="text-left">{'\u2212'} Deficit</span>
        <span className="text-center">0</span>
        <span className="text-right">+ Surplus</span>
      </div>
    </div>
  )
}
