import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  copyText,
  createSyncToken,
  listSyncTokens,
  revokeSyncToken,
  type MintedToken,
  type SyncToken,
} from '@/lib/sync-tokens'

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

function since(iso: string | null) {
  if (!iso) return 'never used'
  const minutes = Math.round((Date.parse(iso) - Date.now()) / 60_000)
  if (Math.abs(minutes) < 60) return RELATIVE.format(minutes, 'minute')
  if (Math.abs(minutes) < 1440) return RELATIVE.format(Math.round(minutes / 60), 'hour')
  return RELATIVE.format(Math.round(minutes / 1440), 'day')
}

export function SyncTokensSection() {
  const [tokens, setTokens] = useState<SyncToken[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [label, setLabel] = useState('iPhone')
  const [minted, setMinted] = useState<MintedToken | null>(null)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setTokens(await listSyncTokens())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load tokens')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Loading the token list from Supabase on mount is exactly the external
    // system sync this rule carves out; the setState happens after the await.
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh()
  }, [refresh])

  async function handleCreate() {
    setCreating(true)
    try {
      const token = await createSyncToken(label.trim() || 'Shortcut')
      setMinted(token)
      setCopied(false)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create token')
    } finally {
      setCreating(false)
    }
  }

  async function handleCopy() {
    if (!minted) return
    const ok = await copyText(minted.token)
    setCopied(ok)
    if (!ok) toast.error('Copy blocked - select the token and copy it manually.')
  }

  async function handleRevoke(token: SyncToken) {
    try {
      await revokeSyncToken(token.id)
      if (minted?.id === token.id) setMinted(null)
      await refresh()
      toast.success(`Revoked ${token.label}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not revoke token')
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Health sync</h3>
        <p className="text-muted-foreground text-xs">
          A token lets an iOS Shortcut post Health data as you.
        </p>
      </div>

      {minted && (
        <div className="border-brand/40 bg-brand/5 space-y-2 rounded-lg border p-3">
          <p className="text-xs font-medium">Copy this now - it is never shown again.</p>
          <p className="bg-background rounded border p-2 font-mono text-[11px] break-all select-all">
            {minted.token}
          </p>
          <Button size="sm" variant="outline" className="w-full" onClick={handleCopy}>
            {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            {copied ? 'Copied' : 'Copy token'}
          </Button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="token-label" className="text-xs">
            Device name
          </Label>
          <Input
            id="token-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="iPhone"
            className="h-9"
          />
        </div>
        <Button className="h-9" onClick={handleCreate} disabled={creating}>
          {creating ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          Create
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-xs">Loading tokens...</p>
      ) : tokens.length === 0 ? (
        <p className="text-muted-foreground text-xs">No active tokens.</p>
      ) : (
        <ul className="divide-border/60 divide-y">
          {tokens.map((token) => (
            <li key={token.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{token.label}</p>
                <p className="text-muted-foreground truncate font-mono text-[11px]">
                  {token.token_prefix}... - {since(token.last_used_at)}
                </p>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => handleRevoke(token)}
                aria-label={`Revoke ${token.label}`}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
