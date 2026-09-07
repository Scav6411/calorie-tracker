import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts so the test run pulls in neither the React
// plugin nor Tailwind - nothing under test renders.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // mealLogToEntry and fetchMealLogs bucket by browser-local time by design,
    // so an unpinned zone passes here and fails on a UTC machine.
    env: { TZ: 'Asia/Kolkata' },
  },
})
