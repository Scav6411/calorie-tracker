import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/db'

export type SyncToken = Pick<
  Tables<'sync_tokens'>,
  'id' | 'label' | 'token_prefix' | 'created_at' | 'last_used_at'
>

export interface MintedToken extends SyncToken {
  /** The raw token. Returned once by the edge function and never stored. */
  token: string
}

export async function listSyncTokens(): Promise<SyncToken[]> {
  const { data, error } = await supabase
    .from('sync_tokens')
    .select('id, label, token_prefix, created_at, last_used_at')
    .is('revoked_at', null)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Minted server-side: hashing needs crypto.subtle, which the browser only
 * exposes in a secure context, and dev runs over plain http on the LAN.
 */
export async function createSyncToken(label: string): Promise<MintedToken> {
  const { data, error } = await supabase.functions.invoke<MintedToken>('create-sync-token', {
    body: { label },
  })

  if (error) {
    // FunctionsHttpError carries the real message in its response body.
    const detail = await (error as { context?: Response }).context
      ?.json()
      .catch(() => null)
    throw new Error(detail?.error ?? error.message)
  }
  if (!data) throw new Error('No token returned')
  return data
}

export async function revokeSyncToken(id: string): Promise<void> {
  const { error } = await supabase
    .from('sync_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

/**
 * navigator.clipboard is also gated behind a secure context, so fall back to
 * the legacy path before giving up.
 */
export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // Fall through to the legacy approach.
  }

  try {
    const area = document.createElement('textarea')
    area.value = value
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(area)
    return copied
  } catch {
    return false
  }
}
