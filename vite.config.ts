import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

import { envSchema, formatEnvIssues } from './src/env.schema.ts'

const OUT_DIR = 'dist'

/**
 * Fails the build when the environment is misconfigured.
 *
 * Without this a deployment with missing variables builds green and white-screens
 * in the browser, because `src/env.ts` only runs at runtime. On Vercel the values
 * come from project settings via `process.env`, which `loadEnv` also reads.
 */
function envGuard(env: Record<string, string>): Plugin {
  return {
    name: 'callchat:env-guard',
    apply: 'build',
    buildStart() {
      const result = envSchema.safeParse(env)
      if (!result.success) {
        this.error(
          `Invalid environment configuration.\n${formatEnvIssues(result.error)}\n\n` +
            'Set these in the Vercel project settings (or .env for a local build).',
        )
      }
    },
  }
}

/** Removes the MSW service worker from the output of a real-backend build. */
function stripMockWorker(): Plugin {
  return {
    name: 'callchat:strip-mock-worker',
    apply: 'build',
    closeBundle() {
      const worker = join(OUT_DIR, 'mockServiceWorker.js')
      if (existsSync(worker)) rmSync(worker)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const useMocks = env['VITE_USE_MOCKS'] === 'true'

  return {
    plugins: [
      react(),
      tailwindcss(),
      envGuard(env),
      ...(useMocks ? [] : [stripMockWorker()]),
    ],
    resolve: {
      alias: [
        /*
         * Order matters: the specific entry must precede the '@' catch-all.
         * Swapping in the stub is what actually drops MSW from the bundle —
         * a dynamic import behind a false constant is still emitted as a chunk.
         */
        ...(useMocks
          ? []
          : [
              {
                find: '@/mocks/browser',
                replacement: fileURLToPath(
                  new URL('./src/mocks/browser.disabled.ts', import.meta.url),
                ),
              },
            ]),
        { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
        {
          find: '@tests',
          replacement: fileURLToPath(new URL('./tests', import.meta.url)),
        },
      ],
    },
    server: {
      port: 5173,
      strictPort: false,
    },
    build: {
      outDir: OUT_DIR,
      sourcemap: false,
      chunkSizeWarningLimit: 700,
    },
  }
})
