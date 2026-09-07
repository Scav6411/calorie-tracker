import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { readAuthError } from '@/lib/initial-url'
import { useAuth } from '@/hooks/use-auth'

/**
 * Landing spot for magic links. supabase-js consumes the code in the URL via
 * detectSessionInUrl, so this waits for the session to settle and reports
 * whatever went wrong if it does not.
 */
export function AuthCallbackPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [failure] = useState(() => readAuthError())

  useEffect(() => {
    if (loading || failure) return
    if (session) navigate('/', { replace: true })
  }, [loading, session, failure, navigate])

  if (failure) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="space-y-2">
          <h1 className="text-lg font-semibold">Sign-in failed</h1>
          <p className="text-muted-foreground text-sm text-pretty">{failure.description}</p>
          <p className="text-muted-foreground font-mono text-[11px]">{failure.code}</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/', { replace: true })}>
          Try again
        </Button>
      </section>
    )
  }

  if (!loading && !session) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="space-y-2">
          <h1 className="text-lg font-semibold">Could not complete sign-in</h1>
          <p className="text-muted-foreground text-sm text-pretty">
            The link was consumed but no session was created. This usually means the link was
            opened in a different browser from the one that requested it.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/', { replace: true })}>
          Try again
        </Button>
      </section>
    )
  }

  return (
    <div className="space-y-4 py-12">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-32 w-full" />
      <p className="text-muted-foreground text-sm">Signing you in...</p>
    </div>
  )
}
