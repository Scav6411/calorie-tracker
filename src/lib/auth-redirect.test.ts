import { describe, expect, it } from 'vitest'
import { authRedirectUrl } from '@/lib/auth-redirect'

describe('authRedirectUrl', () => {
  it('builds the callback for every origin the app is served from', () => {
    expect(authRedirectUrl('http://localhost:5173')).toBe('http://localhost:5173/auth/callback')
    expect(authRedirectUrl('http://192.168.1.13:5173')).toBe(
      'http://192.168.1.13:5173/auth/callback',
    )
    expect(authRedirectUrl('https://calorie-tracker-cg6.pages.dev')).toBe(
      'https://calorie-tracker-cg6.pages.dev/auth/callback',
    )
  })

  it('never produces a double slash', () => {
    // Supabase matches the allow-list literally, so "//auth/callback" would be
    // rejected and silently fall back to the Site URL.
    expect(authRedirectUrl('http://localhost:5173/')).toBe('http://localhost:5173/auth/callback')
  })
})
