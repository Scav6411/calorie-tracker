import { useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'

export function SignInDialog({ trigger }: { trigger: ReactNode }) {
  const { signInWithEmail } = useAuth()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSending(true)
    const { error } = await signInWithEmail(email.trim())
    setSending(false)

    if (error) {
      toast.error(error)
      return
    }
    setSent(true)
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) setSent(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{sent ? 'Check your inbox' : 'Sign in'}</DialogTitle>
          <DialogDescription>
            {sent
              ? `We sent a one-time sign-in link to ${email}. Open it on this device.`
              : 'Enter your email and we will send you a magic link. No password needed.'}
          </DialogDescription>
        </DialogHeader>

        {!sent && (
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={sending || email.trim().length === 0}>
              {sending ? 'Sending link…' : 'Send magic link'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
