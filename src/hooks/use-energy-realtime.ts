import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

/** What the subscription is doing, so a failure is visible rather than silent. */
export type RealtimeStatus = 'off' | 'connecting' | 'live' | 'error' | 'closed'

/**
 * Refetches the day's energy the moment a reading is written.
 *
 * Replaces guessing at how long the launcher Shortcut's upload will take. The
 * edge function writes the row; Postgres publishes the change; this fires. RLS
 * applies to the subscription, so the filter below is belt-and-braces rather
 * than the thing keeping other users' rows out.
 *
 * apple-health-sync upserts on (user_id, synced_at), so a re-sync of the same
 * bucket arrives as an UPDATE rather than an INSERT - hence event '*'.
 *
 * Returns its status because every way this fails is quiet: not signed in, the
 * table missing from the supabase_realtime publication, Realtime disabled for
 * the project. All of them look identical from the outside - data that only
 * appears when you reload.
 */
/**
 * How long to wait for a burst to finish before refetching. One upload writes a
 * row per hour whose figure moved, so a single sync can arrive as a dozen
 * events within a few milliseconds; refetching on each one would be a dozen
 * requests for the same answer.
 */
const BURST_WINDOW_MS = 300

export function useEnergyRealtime(
  userId: string | null,
  onChange: () => void,
  enabled: boolean,
): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>('off')

  // Held in a ref so a new callback identity does not tear down and rebuild the
  // socket - onChange changes every time the viewed day does.
  const handler = useRef(onChange)
  useEffect(() => {
    handler.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!enabled || !userId) {
      // oxlint-disable-next-line react/set-state-in-effect
      setStatus('off')
      return
    }

    // oxlint-disable-next-line react/set-state-in-effect
    setStatus('connecting')

    let burst: ReturnType<typeof setTimeout> | undefined
    const refetchOnce = () => {
      if (burst) clearTimeout(burst)
      burst = setTimeout(() => handler.current(), BURST_WINDOW_MS)
    }

    const channel = supabase
      .channel(`energy-readings-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'energy_readings',
          filter: `user_id=eq.${userId}`,
        },
        refetchOnce,
      )
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') setStatus('live')
        else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') setStatus('error')
        else if (state === 'CLOSED') setStatus('closed')
      })

    return () => {
      if (burst) clearTimeout(burst)
      void supabase.removeChannel(channel)
    }
  }, [userId, enabled])

  return status
}
