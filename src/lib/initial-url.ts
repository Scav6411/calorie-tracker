/**
 * The URL as it was when the tab loaded.
 *
 * supabase-js (detectSessionInUrl) consumes the auth params and rewrites the
 * address bar during initialisation, so anything that needs to read them has to
 * capture them first. This module is imported before the Supabase client to
 * guarantee that ordering.
 */
export const INITIAL_URL = window.location.href

export interface AuthCallbackError {
  code: string
  description: string
}

/** Reads an auth error from the query string or the hash fragment. */
export function readAuthError(href: string = INITIAL_URL): AuthCallbackError | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }

  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const error = url.searchParams.get('error') ?? hash.get('error')
  if (!error) return null

  const code = url.searchParams.get('error_code') ?? hash.get('error_code') ?? error
  const description =
    url.searchParams.get('error_description') ?? hash.get('error_description') ?? error

  return { code, description: description.replaceAll('+', ' ') }
}
