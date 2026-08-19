import { z } from 'zod'

/**
 * Build-time environment contract.
 *
 * Validated once at boot so a misconfigured deployment fails loudly and
 * immediately, instead of surfacing as a confusing runtime API error.
 *
 * ONLY browser-safe values live here. Backend secrets, payment provider keys,
 * private certificates and database credentials must never reach this file or
 * the build output — see plan.md §11E.
 */
export const envSchema = z.object({
  /** Base URL of the existing Node.js backend, e.g. https://staging-api.callchat.app */
  VITE_API_BASE_URL: z
    .string()
    .min(1, 'VITE_API_BASE_URL is required')
    .url('VITE_API_BASE_URL must be a valid URL'),

  /** Shown as a loud badge in the top bar so staging is never mistaken for production. */
  VITE_ENV_LABEL: z.enum(['local', 'development', 'staging', 'production']),

  /** When true the app boots the MSW mock backend instead of calling the real API. */
  VITE_USE_MOCKS: z.enum(['true', 'false']).transform((value) => value === 'true'),

  /** Optional release identifier surfaced in error reports and the admin menu. */
  VITE_RELEASE: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

export function parseEnv(source: unknown): Env {
  const result = envSchema.safeParse(source)

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')

    throw new Error(
      `Invalid environment configuration.\n${issues}\n\n` +
        'Copy .env.example to .env.local and fill in the required values.',
    )
  }

  return result.data
}

export const env = parseEnv(import.meta.env)

export const isProduction = env.VITE_ENV_LABEL === 'production'
export const isMockMode = env.VITE_USE_MOCKS

/** Versioned API root — every request in api/client.ts is built from this. */
export const API_URL = `${env.VITE_API_BASE_URL.replace(/\/$/, '')}/api/v1`
