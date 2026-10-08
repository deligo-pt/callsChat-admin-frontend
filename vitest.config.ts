import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@tests': fileURLToPath(new URL('./tests', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    css: false,
    /*
     * ⚠️ Raised from the 5000ms default — plan.md O11. See `tests/setup.ts`
     * for the measurement and the reasoning; in short, the announcements
     * editor tests type thousands of characters through `userEvent` into the
     * hostile fixture and legitimately need longer than five seconds when the
     * machine is doing anything else.
     *
     * This has to move together with `asyncUtilTimeout` in the setup file: a
     * `waitFor` allowed 5s inside a test capped at 5s can never report its own
     * failure, only the test's.
     */
    testTimeout: 20_000,
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/mocks/**',
        'src/**/index.ts',
        'src/main.tsx',
      ],
    },
  },
})
