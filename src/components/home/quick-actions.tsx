import { Plus, Scale } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function QuickActions({
  onLogMeal,
  onLogWeight,
}: {
  onLogMeal: () => void
  onLogWeight: () => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Button variant="outline" className="h-12 text-sm" onClick={onLogMeal}>
        <Plus className="size-4" aria-hidden />
        Log meal
      </Button>
      <Button variant="outline" className="h-12 text-sm" onClick={onLogWeight}>
        <Scale className="size-4" aria-hidden />
        Log weight
      </Button>
    </div>
  )
}
