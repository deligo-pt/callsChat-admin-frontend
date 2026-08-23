import { envSchema, formatEnvIssues, type Env } from './env.schema'

/**
 * Build-time environment contract.
 *
 * Validated twice: once by the Vite build (see `vite.config.ts`) so a
 * misconfigured deployment fails the build rather than shipping a white screen,
 * and once here at boot so a stale or hand-edited bundle still fails loudly.
 */
export type { Env }
export { envSchema }

export function parseEnv(source: unknown): Env {
  const result = envSchema.safeParse(source)

  if (!result.success) {
    throw new Error(
      `Invalid environment configuration.\n${formatEnvIssues(result.error)}\n\n` +
        'Copy .env.example to .env and fill in the required values.',
    )
  }

  return result.data
}

export const env = parseEnv(import.meta.env)

export const isProduction = env.VITE_ENV_LABEL === 'production'
export const isMockMode = env.VITE_USE_MOCKS

/** Versioned API root — every request in api/client.ts is built from this. */
export const API_URL = `${env.VITE_API_BASE_URL.replace(/\/$/, '')}/api/v1`
