import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { isSameDay } from '@/lib/mock-data'

const FULL_DATE = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
})
const SHORT_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

function relativeLabel(date: Date) {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (isSameDay(date, today)) return 'Today'
  if (isSameDay(date, yesterday)) return 'Yesterday'
  return SHORT_DATE.format(date)
}

/** The date in the header, tappable to jump the whole screen to another day. */
export function DateSwitcher({
  value,
  onChange,
}: {
  value: Date
  onChange: (date: Date) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="hover:bg-muted/50 -m-1.5 rounded-lg p-1.5 text-left transition-colors"
          aria-label="Change date"
        >
          <p className="text-muted-foreground text-xs">{FULL_DATE.format(value)}</p>
          <span className="flex items-center gap-1">
            <span className="text-xl font-semibold tracking-tight">{relativeLabel(value)}</span>
            <ChevronDown className="text-muted-foreground size-4" aria-hidden />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={value}
          defaultMonth={value}
          // No data can exist for days that have not happened yet.
          disabled={{ after: new Date() }}
          onSelect={(date) => {
            if (!date) return
            onChange(date)
            setOpen(false)
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
