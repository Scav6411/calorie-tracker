import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Minus, Plus, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  caloriesFor,
  createFoodItem,
  insertMealLog,
  parseQuantity,
  searchFoods,
  tagForHour,
  MEAL_TAGS,
  type FoodItem,
  type MealLog,
  type MealTag,
} from '@/lib/meals'
import { relativeDayLabel, toDayKey } from '@/lib/mock-data'
import { demoMealLog } from '@/lib/demo-data'
import { useKeyboardInset } from '@/hooks/use-keyboard-inset'
import { WhenField } from '@/components/home/when-field'
import { demoCreateFood, demoSearchFoods } from '@/lib/demo-foods'
import { cn } from '@/lib/utils'

const SEARCH_DEBOUNCE_MS = 250
const DOT = '·'

/** Sentinel for a food the user typed but chose not to add to the catalogue. */
const ONE_OFF_ID = '__one_off__'

/** Offered alongside the food's own unit when overriding it at log time. */
const COMMON_UNITS = [
  'serving', 'piece', 'bowl', 'plate', 'glass', 'cup', 'slice', 'scoop', 'tbsp', 'tsp', '100g',
]



/**
 * Log Meal.
 *
 * The top zone only reads state; every input lives below it. Writing is a plain
 * authenticated insert - RLS enforces ownership, so no edge function is needed.
 */
export function LogMealDrawer({
  open,
  onOpenChange,
  date,
  onLogged,
  onJumpToDay,
  demo = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The day currently shown on Home; new logs default to it. */
  date: Date
  onLogged: (log: MealLog, foodItemId: string | null) => void
  /** Jumps Home to another day, for a meal logged outside the day on screen. */
  onJumpToDay?: (date: Date) => void
  /** Demo mode has no session: search and logging stay in memory. */
  demo?: boolean
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoodItem[]>([])
  const [searching, setSearching] = useState(false)
  const [food, setFood] = useState<FoodItem | null>(null)

  const [creating, setCreating] = useState(false)
  const [newCalories, setNewCalories] = useState('')
  const [newUnit, setNewUnit] = useState('')
  const [savingFood, setSavingFood] = useState(false)

  // The typed string is the source of truth; the number is derived from it, so
  // a half-typed "1." never has to round-trip through a number and back.
  const [qtyText, setQtyText] = useState('1')
  const [unitOverride, setUnitOverride] = useState<string | null>(null)
  const [loggedAt, setLoggedAt] = useState(() => new Date())
  const [mealTag, setMealTag] = useState<MealTag>(() => tagForHour(new Date().getHours()))
  const [tagTouched, setTagTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const keyboardInset = useKeyboardInset()

  const reset = useCallback(() => {
    const now = new Date()
    const initial = new Date(date)
    initial.setHours(now.getHours(), now.getMinutes(), 0, 0)

    setQuery('')
    setResults([])
    setFood(null)
    setCreating(false)
    setNewCalories('')
    setNewUnit('')
    setQtyText('1')
    setUnitOverride(null)
    setLoggedAt(initial)
    setMealTag(tagForHour(initial.getHours()))
    setTagTouched(false)
  }, [date])

  useEffect(() => {
    // Controlled reset: the drawer stays mounted between opens so it can
    // animate, so its form has to be cleared when it reopens.
    // oxlint-disable-next-line react/set-state-in-effect
    if (open) reset()
  }, [open, reset])

  useEffect(() => {
    if (!open || food) return
    const term = query.trim()
    // An empty query needs no request; the results are derived away below.
    if (term === '') return

    // Kicks off a debounced request to an external system.
    // oxlint-disable-next-line react/set-state-in-effect
    setSearching(true)
    const timer = setTimeout(() => {
      if (demo) {
        setResults(demoSearchFoods(term))
        setSearching(false)
        return
      }
      searchFoods(term)
        .then(setResults)
        .catch((error) => toast.error(error instanceof Error ? error.message : 'Search failed'))
        .finally(() => setSearching(false))
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query, open, food, demo])

  const quantity = parseQuantity(qtyText)
  const validQty = quantity !== null
  const unit = unitOverride ?? food?.default_unit ?? 'serving'
  const unitOptions = useMemo(() => {
    const base = food?.default_unit ?? 'serving'
    return [base, ...COMMON_UNITS.filter((option) => option !== base)]
  }, [food])
  const previewKcal =
    food && quantity !== null ? caloriesFor(food.calories_per_unit, quantity) : 0
  const canSubmit = Boolean(food) && validQty && !submitting

  const step = (delta: number) =>
    setQtyText(String(Math.max(0.5, Number(((quantity ?? 1) + delta).toFixed(2)))))

  // Derived rather than cleared in an effect, so a stale list can never show.
  const hasQuery = query.trim() !== ''
  const visibleResults = food || !hasQuery ? [] : results
  const isSearching = searching && hasQuery

  const noMatches = useMemo(
    () => !food && hasQuery && !isSearching && visibleResults.length === 0,
    [food, hasQuery, isSearching, visibleResults.length],
  )

  function pickFood(item: FoodItem) {
    setFood(item)
    setResults([])
    setCreating(false)
    // The previous food's unit must not follow the new one.
    setUnitOverride(null)
  }

  /** Logs a food without ever writing it to the catalogue (P1). */
  function handleUseOnce() {
    const calories = Number(newCalories)
    if (!Number.isFinite(calories) || calories <= 0) {
      toast.error('Enter the calories per unit')
      return
    }
    pickFood({
      id: ONE_OFF_ID,
      name: query.trim(),
      default_unit: newUnit.trim() || 'serving',
      calories_per_unit: calories,
      is_personal: true,
    })
  }

  function setWhen(next: Date) {
    setLoggedAt(next)
    if (!tagTouched) setMealTag(tagForHour(next.getHours()))
  }

  async function handleCreateFood() {
    const calories = Number(newCalories)
    if (!Number.isFinite(calories) || calories <= 0) {
      toast.error('Enter the calories per unit')
      return
    }
    setSavingFood(true)
    try {
      const input = { name: query.trim(), caloriesPerUnit: calories, unit: newUnit }
      pickFood(demo ? demoCreateFood(input) : await createFoodItem(input))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add food')
    } finally {
      setSavingFood(false)
    }
  }

  async function handleSubmit() {
    if (!food || quantity === null) return
    const foodItemId = food.id === ONE_OFF_ID ? null : food.id
    setSubmitting(true)
    try {
      const log = demo
        ? demoMealLog({
            name: food.name,
            quantity,
            unit,
            calories: previewKcal,
            meal_tag: mealTag,
            logged_at: loggedAt.toISOString(),
          })
        : await insertMealLog({
            foodItemId,
            name: food.name,
            quantity,
            unit,
            calories: previewKcal,
            mealTag,
            loggedAt,
          })
      onLogged(log, foodItemId)
      onOpenChange(false)

      // Backdating is easy to do by accident. addLocally deliberately refuses a
      // log belonging to another day, so without saying where it went the user
      // sees "logged" and nothing change.
      const elsewhere = toDayKey(loggedAt) !== toDayKey(date)
      toast.success(`${food.name} logged`, {
        description: elsewhere
          ? `${previewKcal} kcal ${DOT} ${relativeDayLabel(loggedAt)}`
          : `${previewKcal} kcal`,
        ...(elsewhere && onJumpToDay
          ? { action: { label: 'View', onClick: () => onJumpToDay(new Date(loggedAt)) } }
          : {}),
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not log meal')
    } finally {
      setSubmitting(false)
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
            {previewKcal.toLocaleString()}
          </SheetTitle>
          <SheetDescription>
            {food
              ? `${quantity} x ${food.name} ${DOT} ${previewKcal.toLocaleString()} kcal`
              : 'Search for a food to begin'}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {food ? (
            <button
              type="button"
              onClick={() => setFood(null)}
              className="border-border/70 bg-card flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left"
            >
              <Check className="text-brand size-4 shrink-0" aria-hidden />
              <span className="flex-1 truncate text-sm font-medium">{food.name}</span>
              {food.id === ONE_OFF_ID && (
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  one-off
                </Badge>
              )}
              <span className="text-muted-foreground text-xs tabular-nums">
                {food.calories_per_unit} / {unit}
              </span>
              <X className="text-muted-foreground size-4 shrink-0" aria-hidden />
            </button>
          ) : (
            <div className="relative">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search foods"
                className="h-11 pl-9"
                aria-label="Search foods"
              />
            </div>
          )}

          {visibleResults.length > 0 && (
            <div className="border-border/70 -mt-2 max-h-56 overflow-y-auto rounded-lg border">
              <ul className="divide-border/60 divide-y px-2">
              {visibleResults.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => pickFood(item)}
                    className="hover:bg-muted/50 flex w-full items-center gap-3 rounded-md px-1 py-2.5 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{item.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {item.calories_per_unit} kcal / {item.default_unit}
                        {item.is_personal ? '' : ` ${DOT} global`}
                      </span>
                    </span>
                    <Plus className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  </button>
                </li>
              ))}
              </ul>
            </div>
          )}

          {noMatches && !creating && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="border-brand/40 bg-brand/5 w-full rounded-lg border border-dashed px-3 py-3 text-left text-sm"
            >
              Add <span className="font-medium">{query.trim()}</span> as a new food
            </button>
          )}

          {noMatches && creating && (
            <div className="border-border/70 space-y-3 rounded-lg border p-3">
              <p className="text-sm font-medium">New food: {query.trim()}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="new-kcal" className="text-xs">
                    Calories per unit
                  </Label>
                  <Input
                    id="new-kcal"
                    type="number"
                    inputMode="numeric"
                    placeholder="320"
                    value={newCalories}
                    onChange={(event) => setNewCalories(event.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="new-unit" className="text-xs">
                    Unit (optional)
                  </Label>
                  <Input
                    id="new-unit"
                    placeholder="serving"
                    value={newUnit}
                    onChange={(event) => setNewUnit(event.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Button size="sm" className="w-full" onClick={handleCreateFood} disabled={savingFood}>
                  {savingFood && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  Save food and select
                </Button>
                {/* The log snapshots name and calories anyway, so a one-off needs
                    no catalogue row and will not clutter future searches. */}
                <Button size="sm" variant="ghost" className="w-full" onClick={handleUseOnce}>
                  Use once, don{'’'}t save
                </Button>
              </div>
            </div>
          )}

          <div
            className={cn(
              'space-y-4 transition-opacity',
              !food && 'pointer-events-none opacity-40',
            )}
          >
              {/* Meal tag and quantity share one row to keep the sheet short. */}
              <div className="flex items-center gap-2">
                <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label="Meal">
                  {MEAL_TAGS.map((tag) => (
                    <Button
                      key={tag}
                      size="icon-sm"
                      variant={mealTag === tag ? 'default' : 'outline'}
                      onClick={() => {
                        setMealTag(tag)
                        setTagTouched(true)
                      }}
                      aria-label={tag}
                      aria-pressed={mealTag === tag}
                      title={tag}
                      className="uppercase"
                    >
                      {tag.charAt(0)}
                    </Button>
                  ))}
                </div>

                <div className="flex flex-1 justify-center">
                  <div className="bg-border h-6 w-px" aria-hidden />
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Label className="text-muted-foreground shrink-0 text-xs">Qty</Label>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    onClick={() => step(-0.5)}
                    disabled={!validQty || (quantity ?? 0) <= 0.5}
                    aria-label="Decrease quantity"
                    className="shrink-0"
                  >
                    <Minus className="size-3.5" aria-hidden />
                  </Button>
                  {/* Fixed width, not a floor: the unit is a select now, so only a
                      hard width keeps the steppers from shifting as it changes. */}
                  <span className="border-border/70 focus-within:border-ring flex w-[6.5rem] items-center justify-center gap-1 rounded-md border border-transparent px-1 text-sm">
                    {/* A raw input: ui/input carries its own height, border and
                        background, which would break the inline look. */}
                    <input
                      type="text"
                      inputMode="decimal"
                      value={qtyText}
                      onChange={(event) => setQtyText(event.target.value)}
                      onFocus={(event) => event.target.select()}
                      onBlur={() => {
                        if (!validQty) setQtyText('1')
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur()
                      }}
                      aria-label="Quantity"
                      aria-invalid={!validQty}
                      className="w-[4ch] min-w-0 bg-transparent text-right tabular-nums outline-none"
                    />
                    <Select value={unit} onValueChange={setUnitOverride}>
                      <SelectTrigger
                        size="sm"
                        aria-label="Unit"
                        className="text-muted-foreground h-auto max-w-[9ch] gap-0.5 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent [&_svg]:size-3"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {unitOptions.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </span>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    onClick={() => step(0.5)}
                    aria-label="Increase quantity"
                    className="shrink-0"
                  >
                    <Plus className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </div>

              <WhenField value={loggedAt} onChange={setWhen} idPrefix="meal" />
          </div>

          <Button className="h-11 w-full" disabled={!canSubmit} onClick={handleSubmit}>
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Log meal
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
