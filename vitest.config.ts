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
    /*
     * ⚠️ Capped below the core count on purpose — plan.md O10.
     *
     * This suite runs **59 axe scans across 9 files**, and axe is CPU-bound:
     * the suite's own numbers show ~337s of test CPU. On an 8-core machine
     * Vitest's default fan-out puts several of those files on cores at once,
     * each saturating one, and a scan that normally takes three seconds blows
     * through even the 20s ceiling above.
     *
     * The symptom was a rotating set of a11y failures — feedback one run,
     * announcements and bootstrap the next — that **passed whenever the a11y
     * files ran alone** (103/103 in 58s). Measured 2026-10-15: at the default
     * fan-out the full suite failed intermittently; at `maxWorkers: 4` it is
     * `3 failed | 1247 passed` — the known multipart trio and nothing else.
     *
     * The cost is wall time: ~128s against ~85s. That is the right trade. This
     * suite has now lost two sessions to load-induced flakes that looked like
     * four separate bugs, and a deterministic run is worth 40 seconds. It also
     * keeps `testTimeout` meaningful: the ceiling catches genuine hangs rather
     * than policing CPU scheduling, which is what raising it again would do.
     */
    maxWorkers: 4,
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
