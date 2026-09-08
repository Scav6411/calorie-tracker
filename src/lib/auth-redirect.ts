/**
 * Where a magic link should send the browser back to.
 *
 * Derived from the current origin rather than configured, so the same build
 * works on localhost, on a LAN IP from a phone, and on the Pages domain. The
 * catch is that Supabase checks this against its Redirect URLs allow-list and,
 * when it does not match, silently falls back to the project's Site URL instead
 * of erroring - so a missing entry shows up as landing on the wrong host rather
 * than as a failure. Whatever this returns must be listed verbatim in
 * Authentication -> URL Configuration.
 */
export function authRedirectUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/auth/callback`
}
