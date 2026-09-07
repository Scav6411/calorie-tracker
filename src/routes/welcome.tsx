import { ArrowRight, Flame } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SignInDialog } from '@/components/auth/sign-in-dialog'

export function WelcomeScreen() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <Flame className="text-brand size-9" aria-hidden />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          Track what you eat, without the busywork
        </h1>
        <p className="text-muted-foreground text-sm text-pretty">
          A personal calorie log. Sign in with a magic link.
        </p>
      </div>
      <SignInDialog
        trigger={
          <Button className="h-11 w-full max-w-xs">
            Get started
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        }
      />
    </section>
  )
}
