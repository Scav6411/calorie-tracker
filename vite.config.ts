import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

/** Inlined into the bundle at build time; the app cannot start without them. */
const REQUIRED_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Reads .env files and, on a CI runner, any VITE_-prefixed process.env.
  const env = loadEnv(mode, import.meta.dirname, 'VITE_')

  // Missing, these leave the guard in src/lib/supabase.ts as an unconditional
  // throw, and rolldown then drops the whole app behind it: the build succeeds
  // and the deploy serves a blank page with no clue why. Fail here instead,
  // where the reason lands in the build log. Names only - values would leak.
  if (command === 'build') {
    const visible = Object.keys(env).sort()
    console.log(`[env] VITE_ vars visible to this build: ${visible.join(', ') || '(none)'}`)

    const missing = REQUIRED_ENV.filter((key) => !env[key])
    if (missing.length > 0) {
      throw new Error(
        `Missing build env: ${missing.join(', ')}. Set them on the Cloudflare Pages ` +
          'project under Settings > Variables and Secrets, for both Production and ' +
          'Preview, then redeploy. For a local build, put them in .env.local.',
      )
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  }
})
