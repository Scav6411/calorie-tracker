import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Refetches the day's energy the moment a reading is written.
 *
 * Replaces guessing at how long the launcher Shortcut's upload will take. The
 * edge function writes the row; Postgres publishes the change; this fires. RLS
 * applies to the subscription, so the filter below is belt-and-braces rather
 * than the thing keeping other users' rows out.
 *
 * apple-health-sync upserts on (user_id, synced_at), so a re-sync of the same
 * minute arrives as an UPDATE rather than an INSERT - hence event '*'.
 */
export function useEnergyRealtime(userId: string | null, onChange: () => void, enabled: boolean) {
  // Held in a ref so a new callback identity does not tear down and rebuild the
  // socket - onChange changes every time the viewed day does.
  const handler = useRef(onChange)
  useEffect(() => {
    handler.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!enabled || !userId) return

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
        () => handler.current(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, enabled])
}
