import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { WheelPicker } from '@/components/ui/wheel-picker'
import { WhenField } from '@/components/home/when-field'
import { useKeyboardInset } from '@/hooks/use-keyboard-inset'
import { fetchLatestWeight, insertWeightLog } from '@/lib/weight'

const DOT = '\u00b7'
const DEFAULT_WEIGHT = 72.4

// Two decimals over 30-200 kg would be 17,001 values on one track. Splitting
// the whole part from the hundredths keeps it to 171 + 100 items.
const WHOLE = Array.from({ length: 171 }, (_, index) => index + 30)
const HUNDREDTHS = Array.from({ length: 100 }, (_, index) => index)

function timeLabel(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

function split(weight: number) {
  const whole = Math.floor(weight)
  return { whole, hundredths: Math.round((weight - whole) * 100) }
}

/**
 * Log Weight, on the same sheet base as Log Meal. The wheels keep the on-screen
 * keyboard out of the picture entirely.
 */
export function LogWeightSheet({
  open,
  onOpenChange,
  date,
  demo = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The day currently shown on Home; new entries default to it. */
  date: Date
  demo?: boolean
}) {
  const keyboardInset = useKeyboardInset()
  const [whole, setWhole] = useState(() => split(DEFAULT_WEIGHT).whole)
  const [hundredths, setHundredths] = useState(() => split(DEFAULT_WEIGHT).hundredths)
  const [loggedAt, setLoggedAt] = useState(() => new Date())
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)

  // Built from integers, so no floating-point drift creeps into the value.
  const weight = whole + hundredths / 100

  useEffect(() => {
    // Resets on close and loads the last reading on open - a controlled sheet
    // that stays mounted has no other place to do this.
    if (!open) {
      // oxlint-disable-next-line react/set-state-in-effect
      setReady(false)
      return
    }

    const now = new Date()
    const initial = new Date(date)
    initial.setHours(now.getHours(), now.getMinutes(), 0, 0)
    // oxlint-disable-next-line react/set-state-in-effect
    setLoggedAt(initial)

    if (demo) {
      // oxlint-disable-next-line react/set-state-in-effect
      setReady(true)
      return
    }

    let cancelled = false
    fetchLatestWeight()
      .then((latest) => {
        if (cancelled) return
        // The wheels read their start position on mount, so they must not
        // render until this has resolved.
        if (latest) {
          const parts = split(latest.weight_kg)
          setWhole(parts.whole)
          setHundredths(parts.hundredths)
        }
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [open, demo, date])

  async function handleSave() {
    if (demo) {
      toast.success(`${weight.toFixed(2)} kg logged`, { description: 'Demo only - not saved' })
      onOpenChange(false)
      return
    }

    setSaving(true)
    try {
      await insertWeightLog({ weightKg: weight, loggedAt })
      toast.success(`${weight.toFixed(2)} kg logged`, { description: timeLabel(loggedAt) })
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not log weight')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto flex max-w-md flex-col rounded-t-2xl"
        style={{
          bottom: keyboardInset,
          maxHeight: `calc(100svh - ${keyboardInset}px - 1.5rem)`,
        }}
      >
        <SheetHeader className="pb-2 text-center">
          <SheetTitle className="text-4xl font-semibold tracking-tight tabular-nums">
            {weight.toFixed(2)}
          </SheetTitle>
          <SheetDescription>kg {DOT} morning weight</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {ready ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">Kilograms</p>
                <WheelPicker
                  values={WHOLE}
                  value={whole}
                  onChange={setWhole}
                  ariaLabel="Weight in whole kilograms"
                />
              </div>

              <div className="space-y-1">
                <p className="text-muted-foreground text-xs">Hundredths</p>
                <WheelPicker
                  values={HUNDREDTHS}
                  value={hundredths}
                  onChange={setHundredths}
                  format={(item) => `.${String(item).padStart(2, '0')}`}
                  ariaLabel="Weight hundredths of a kilogram"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          )}

          <WhenField value={loggedAt} onChange={setLoggedAt} idPrefix="weight" />

          <Button className="h-11 w-full" onClick={handleSave} disabled={!ready || saving}>
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Log weight
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
