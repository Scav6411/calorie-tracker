import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isSameDay, relativeDayLabel, toDayKey } from '@/lib/mock-data'

const DOT = '\u00b7'

function toTimeValue(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function timeLabel(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

/**
 * Collapsed date+time row. The default needs zero taps for the common case of
 * logging something that just happened; backdating is one tap away.
 */
export function WhenField({
  value,
  onChange,
  idPrefix = 'when',
}: {
  value: Date
  onChange: (next: Date) => void
  idPrefix?: string
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className="border-border/70 flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm"
      >
        <span className="text-muted-foreground text-xs">When</span>
        <span>
          {relativeDayLabel(value)} {DOT} {timeLabel(value)}
        </span>
      </button>

      {expanded && (
        <div className="border-border/70 space-y-3 rounded-lg border p-3">
          <div className="flex gap-2">
            {['Today', 'Yesterday'].map((label, index) => {
              const target = new Date()
              target.setDate(target.getDate() - index)
              target.setHours(value.getHours(), value.getMinutes(), 0, 0)
              return (
                <Button
                  key={label}
                  size="sm"
                  variant={isSameDay(value, target) ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => onChange(target)}
                >
                  {label}
                </Button>
              )
            })}
          </div>
          <div className="grid gap-3">
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor={`${idPrefix}-date`} className="text-xs">
                Date
              </Label>
              <Input
                id={`${idPrefix}-date`}
                type="date"
                className="h-9 w-full min-w-0 text-sm"
                value={toDayKey(value)}
                max={toDayKey(new Date())}
                onChange={(event) => {
                  const [year, month, day] = event.target.value.split('-').map(Number)
                  if (!year) return
                  const next = new Date(value)
                  next.setFullYear(year, month - 1, day)
                  onChange(next)
                }}
              />
            </div>
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor={`${idPrefix}-time`} className="text-xs">
                Time
              </Label>
              <Input
                id={`${idPrefix}-time`}
                type="time"
                className="h-9 w-full min-w-0 text-sm"
                value={toTimeValue(value)}
                onChange={(event) => {
                  const [hours, minutes] = event.target.value.split(':').map(Number)
                  if (Number.isNaN(hours)) return
                  const next = new Date(value)
                  next.setHours(hours, minutes, 0, 0)
                  onChange(next)
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
