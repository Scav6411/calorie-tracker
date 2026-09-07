import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { fetchGoalWeight, updateGoalWeight } from '@/lib/trends'

/**
 * The one profile field Trends actually needs: it draws the goal line on the
 * weight chart. Saved on blur so there is no extra button in the sheet.
 */
export function GoalWeightField() {
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState('')

  useEffect(() => {
    let live = true
    void fetchGoalWeight()
      .then((weight) => {
        if (!live) return
        const text = weight == null ? '' : String(weight)
        // oxlint-disable-next-line react/set-state-in-effect
        setValue(text)
        // oxlint-disable-next-line react/set-state-in-effect
        setSaved(text)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])

  const commit = async () => {
    const trimmed = value.trim()
    if (trimmed === saved) return

    const parsed = trimmed === '' ? null : Number(trimmed)
    if (parsed !== null && (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 500)) {
      toast.error('Enter a weight between 0 and 500 kg')
      setValue(saved)
      return
    }

    try {
      await updateGoalWeight(parsed)
      setSaved(trimmed)
      toast.success('Goal weight saved')
    } catch (error) {
      setValue(saved)
      toast.error(error instanceof Error ? error.message : 'Could not save')
    }
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor="goal-weight" className="text-muted-foreground text-sm">
        Goal weight
      </label>
      <div className="flex items-center gap-1.5">
        <Input
          id="goal-weight"
          inputMode="decimal"
          placeholder="--"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => void commit()}
          className="h-8 w-20 text-right tabular-nums"
        />
        <span className="text-muted-foreground text-sm">kg</span>
      </div>
    </div>
  )
}
