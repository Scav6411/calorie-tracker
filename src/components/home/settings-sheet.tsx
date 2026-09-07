import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/hooks/use-auth'
import { SyncTokensSection } from './sync-tokens-section'
import { GoalWeightField } from './goal-weight-field'

export function SettingsSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { user, signOut } = useAuth()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto flex max-h-[88svh] max-w-md flex-col rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>{user?.email}</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-6">
          {/* Reads from public.profiles once the settings form is wired. */}
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Daily goal</dt>
              <dd className="tabular-nums">2,000 kcal</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Timezone</dt>
              <dd>Asia/Kolkata</dd>
            </div>
          </dl>

          <GoalWeightField />

          <Separator />

          <SyncTokensSection />

          <Separator />

          <Button variant="outline" className="h-10 w-full" onClick={() => void signOut()}>
            <LogOut className="size-4" aria-hidden />
            Sign out
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
