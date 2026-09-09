import { useCallback, useMemo, useState } from 'react'
import { ChartNoAxesColumn, List, RefreshCw, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScreenHeader } from '@/components/layout/screen-header'
import { DateSwitcher } from '@/components/home/date-switcher'
import { DaySummaryCard } from '@/components/home/day-summary-card'
import { QuickActions } from '@/components/home/quick-actions'
import { LogAgain } from '@/components/home/log-again'
import { DayTimelineChart } from '@/components/home/day-timeline-chart'
import { DayMealsList } from '@/components/home/day-meals-list'
import { MealEntrySheet } from '@/components/home/meal-entry-sheet'
import { LogMealDrawer } from '@/components/home/log-meal-drawer'
import { LogWeightSheet } from '@/components/home/log-weight-sheet'
import { SettingsSheet } from '@/components/home/settings-sheet'
import { WelcomeScreen } from './welcome'
import { useAuth } from '@/hooks/use-auth'
import { toDayKey, type DaySummary } from '@/lib/mock-data'
import { demoMealLog, generateDemoMealLogs } from '@/lib/demo-data'
import {
  deleteMealLog,
  insertMealLog,
  mealLogToEntry,
  recentFromLog,
  relogInput,
  type MealLog,
  type RecentFood,
} from '@/lib/meals'
import { useDayMeals } from '@/hooks/use-day-meals'
import { useRecentFoods } from '@/hooks/use-recent-foods'
import { cn } from '@/lib/utils'
import { dayTotals, syncAgeLabel, toHourlyBurn } from '@/lib/energy'
import { useDayEnergy } from '@/hooks/use-day-energy'
import { useSyncCatchUp } from '@/hooks/use-sync-catchup'
import { useEnergyRealtime } from '@/hooks/use-energy-realtime'
import { useToday } from '@/hooks/use-today'
import { parseDayKey } from '@/lib/trend-math'

export function HomePage({ demo = false }: { demo?: boolean }) {
  const { session, loading } = useAuth()
  const today = useToday()
  /*
   * null means "whatever day it is now". Holding a Date in state pinned the
   * screen to the day the app was opened, so an app left open past midnight
   * kept showing yesterday - and, worse, stamped anything logged afterwards
   * with yesterday's date. Picking a past day opts out until it is picked
   * back, and choosing today opts back in.
   */
  const [picked, setPicked] = useState<string | null>(null)
  const date = useMemo(() => parseDayKey(picked ?? today), [picked, today])
  const setDate = useCallback(
    (next: Date) => {
      const key = toDayKey(next)
      setPicked(key === today ? null : key)
    },
    [today],
  )
  const [mealOpen, setMealOpen] = useState(false)
  const [weightOpen, setWeightOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [view, setView] = useState<'chart' | 'list'>('chart')
  const [selected, setSelected] = useState<MealLog | null>(null)
  const [entryOpen, setEntryOpen] = useState(false)
  const [relogging, setRelogging] = useState<string | null>(null)

  const energy = useDayEnergy(date, Boolean(session), demo)
  // The app is opened from a Home Screen Shortcut that also runs the Health
  // sync, so on launch the upload is still in flight when the page first reads
  // energy_readings. Only for today: a past day has nothing arriving for it.
  // Primary: the row is pushed the instant apple-health-sync writes it.
  const liveStatus = useEnergyRealtime(
    session?.user.id ?? null,
    energy.reload,
    !demo && Boolean(session),
  )
  // Fallback, two cheap queries: covers the socket not being up yet at launch,
  // and the case where the realtime migration has not been pushed.
  useSyncCatchUp(energy.reload, !demo && Boolean(session) && picked === null)
  const mealState = useDayMeals(date, Boolean(session) && !demo)
  const recent = useRecentFoods(Boolean(session) && !demo, demo)
  // Demo has no session to write with, so logs live in memory for the session.
  const [demoLogs, setDemoLogs] = useState<MealLog[]>([])
  const [demoDeleted, setDemoDeleted] = useState<string[]>([])

  const mealLogs = useMemo(() => {
    if (!demo) return mealState.logs
    const day = toDayKey(date)
    const added = demoLogs.filter((log) => toDayKey(new Date(log.logged_at)) === day)
    return [...generateDemoMealLogs(date), ...added]
      .filter((log) => !demoDeleted.includes(log.id))
      .sort((a, b) => a.logged_at.localeCompare(b.logged_at) || a.id.localeCompare(b.id))
  }, [demo, date, mealState.logs, demoLogs, demoDeleted])

  const meals = useMemo(() => mealLogs.map(mealLogToEntry), [mealLogs])

  const handleLogged = useCallback(
    (log: MealLog, foodItemId: string | null) => {
      if (demo) setDemoLogs((previous) => [...previous, log])
      else mealState.addLocally(log)
      // The new log IS the newest entry for that food, so the strip can be
      // reordered exactly rather than refetched.
      recent.promote(recentFromLog(log, foodItemId))
    },
    [demo, mealState, recent],
  )

  /** One tap on a "Log again" card: same entry, stamped now on the viewed day. */
  const handleLogAgain = useCallback(
    async (item: RecentFood) => {
      setRelogging(item.food_key)
      const now = new Date()
      const at = new Date(date)
      at.setHours(now.getHours(), now.getMinutes(), 0, 0)
      const input = relogInput(item, at)
      try {
        const log = demo
          ? demoMealLog({
              name: input.name,
              quantity: input.quantity,
              unit: input.unit,
              calories: input.calories,
              meal_tag: input.mealTag,
              logged_at: at.toISOString(),
            })
          : await insertMealLog(input)
        handleLogged(log, item.food_item_id)
        toast.success(`${item.name} logged`, { description: `${Math.round(item.calories)} kcal` })
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not log meal')
      } finally {
        setRelogging(null)
      }
    },
    [date, demo, handleLogged],
  )

  const handleDeleteEntry = useCallback(
    async (entry: MealLog) => {
      if (demo) {
        // Demo ids are not uuids, so they must never reach PostgREST.
        setDemoDeleted((previous) => [...previous, entry.id])
        setDemoLogs((previous) => previous.filter((log) => log.id !== entry.id))
      } else {
        const removed = await deleteMealLog(entry.id)
        if (!removed) throw new Error('That entry no longer exists')
        mealState.removeLocally(entry.id)
        // A delete cannot be applied to the strip locally: the card may need to
        // fall back to an older log of the same food, or disappear entirely.
        void recent.reload()
      }
      toast.success(`${entry.name} deleted`, {
        description: `${Math.round(entry.calories)} kcal removed`,
      })
    },
    [demo, mealState, recent],
  )

  const openEntry = useCallback((log: MealLog) => {
    setSelected(log)
    setEntryOpen(true)
  }, [])

  const totals = useMemo(() => dayTotals(energy.readings), [energy.readings])
  const hourly = useMemo(() => toHourlyBurn(energy.readings), [energy.readings])

  const summary = useMemo<DaySummary>(() => {
    const eaten = meals.reduce((total, meal) => total + meal.kcal, 0)
    const burned = totals?.total ?? 0

    let burnSource: string
    if (energy.loading) burnSource = 'Loading Health data...'
    else if (energy.error) burnSource = energy.error
    else if (totals) {
      burnSource = `Burned via Apple Health \u00b7 synced ${syncAgeLabel(totals.lastSyncedAt)}`
      // Dev only. Every way this subscription can fail is silent, and the
      // symptom - data that appears only on reload - is identical for all of
      // them. A console log is no use on the phone this runs on.
      if (import.meta.env.DEV) burnSource += ` \u00b7 live: ${liveStatus}`
    } else burnSource = 'No Health sync for this day yet'

    return { date, eaten, burned, burnSource }
  }, [date, meals, totals, energy.loading, energy.error, liveStatus])

  if (loading && !demo) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <Skeleton className="h-12 w-40" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="min-h-0 flex-1" />
      </div>
    )
  }

  if (!session && !demo) return <WelcomeScreen />

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 pb-3">
      <ScreenHeader
        action={
          // In the header rather than a third Quick Action: Home is a fixed
          // h-svh with no scroll, and this row already exists.
          <div className="flex shrink-0 items-center">
            {/* Refetches what the Shortcut already uploaded. Deliberately
                NOT the Shortcuts handoff: that one leaves the app, and once a
                Personal Automation is running there is nothing to trigger. */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void energy.reload()}
              disabled={energy.loading}
              aria-label="Refresh Health data"
            >
              <RefreshCw
                className={cn('size-5', energy.loading && 'animate-spin')}
                aria-hidden
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
            >
              <Settings className="size-5" aria-hidden />
            </Button>
          </div>
        }
      >
        <DateSwitcher value={date} onChange={setDate} />
      </ScreenHeader>

      <DaySummaryCard summary={summary} />

      <QuickActions onLogMeal={() => setMealOpen(true)} onLogWeight={() => setWeightOpen(true)} />

      <LogAgain
        items={recent.items}
        loading={recent.loading}
        pendingKey={relogging}
        onAdd={(item) => void handleLogAgain(item)}
      />

      {/* Takes whatever height is left over - the page itself never scrolls. */}
      <section className="flex min-h-[8rem] flex-1 flex-col gap-2">
        <h2 className="sr-only">Timeline</h2>
        <div className="flex shrink-0 items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Timeline view"
            className="bg-muted/60 flex shrink-0 rounded-md p-0.5"
          >
            {(
              [
                { mode: 'chart' as const, Icon: ChartNoAxesColumn, label: 'Chart' },
                { mode: 'list' as const, Icon: List, label: 'List' },
              ]
            ).map(({ mode, Icon, label }) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={view === mode}
                aria-label={`${label} view`}
                onClick={() => setView(mode)}
                className={cn(
                  'rounded-sm px-2 py-1 transition-colors',
                  view === mode
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground',
                )}
              >
                <Icon className="size-3.5" aria-hidden />
              </button>
            ))}
          </div>

          {/* The legend only means anything against the chart; in list mode the
              same row carries the day's tally so its height never changes. */}
          {view === 'chart' ? (
            <div className="text-muted-foreground flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="bg-brand size-2 rounded-full" aria-hidden />
                Eaten
              </span>
              <span className="flex items-center gap-1.5">
                <span className="bg-muted-foreground size-2 rounded-full" aria-hidden />
                Burned
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground text-[11px] tabular-nums">
              {mealLogs.length} {mealLogs.length === 1 ? 'meal' : 'meals'} {'·'}{' '}
              {Math.round(summary.eaten).toLocaleString('en-US')} kcal
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1">
          {view === 'chart' ? (
            <DayTimelineChart meals={meals} hourly={hourly} />
          ) : (
            <DayMealsList
              logs={mealLogs}
              loading={!demo && mealState.loading}
              error={demo ? null : mealState.error}
              isToday={picked === null}
              onSelect={openEntry}
            />
          )}
        </div>
      </section>

      <LogMealDrawer
        open={mealOpen}
        onOpenChange={setMealOpen}
        date={date}
        onLogged={handleLogged}
        onJumpToDay={setDate}
        demo={demo}
      />
      <LogWeightSheet
        open={weightOpen}
        onOpenChange={setWeightOpen}
        date={date}
        demo={demo}
      />
      <MealEntrySheet
        open={entryOpen}
        onOpenChange={setEntryOpen}
        entry={selected}
        onDelete={handleDeleteEntry}
      />
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
