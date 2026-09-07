import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useKeyboardInset } from '@/hooks/use-keyboard-inset'
import { relativeDayLabel } from '@/lib/mock-data'
import type { MealLog } from '@/lib/meals'

const TIME = new Intl.DateTimeFormat('en-GB', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

/**
 * One logged entry, with the only destructive action in the app that the user
 * can reach by accident. The sheet itself is the confirmation step - opening it
 * takes a deliberate tap, and the delete button is a second one - so there is
 * no separate confirm dialog.
 */
export function MealEntrySheet({
  open,
  onOpenChange,
  entry,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Stays set while the sheet animates out, so the body never blanks mid-close.
   * The parent overwrites it on the next open rather than clearing it.
   */
  entry: MealLog | null
  onDelete: (entry: MealLog) => Promise<void>
}) {
  const keyboardInset = useKeyboardInset()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!entry) return
    setDeleting(true)
    try {
      await onDelete(entry)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete entry')
    } finally {
      setDeleting(false)
    }
  }

  const at = entry ? new Date(entry.logged_at) : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto flex max-w-md flex-col rounded-t-2xl"
        style={{ bottom: keyboardInset, maxHeight: `calc(100svh - ${keyboardInset}px - 1.5rem)` }}
      >
        <SheetHeader className="pb-2 text-center">
          <SheetTitle className="text-4xl font-semibold tracking-tight tabular-nums">
            {entry ? Math.round(entry.calories).toLocaleString('en-US') : ''}
          </SheetTitle>
          <SheetDescription>{entry?.name ?? ''}</SheetDescription>
        </SheetHeader>

        {entry && at && (
          <ul className="divide-border/60 divide-y px-4 text-sm">
            <li className="flex items-center justify-between gap-3 py-2">
              <span className="text-muted-foreground text-xs">When</span>
              <span>
                {relativeDayLabel(at)} {'\u00b7'} {TIME.format(at)}
              </span>
            </li>
            <li className="flex items-center justify-between gap-3 py-2">
              <span className="text-muted-foreground text-xs">Meal</span>
              <span className="capitalize">{entry.meal_tag}</span>
            </li>
            <li className="flex items-center justify-between gap-3 py-2">
              <span className="text-muted-foreground text-xs">Amount</span>
              <span className="tabular-nums">
                {entry.quantity} {entry.unit}
              </span>
            </li>
          </ul>
        )}

        <SheetFooter className="pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <Button
            variant="destructive"
            className="h-11 w-full"
            onClick={() => void handleDelete()}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="size-4" aria-hidden />
            )}
            Delete entry
          </Button>
          <SheetClose asChild>
            <Button variant="ghost" className="h-9 w-full">
              Keep it
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
