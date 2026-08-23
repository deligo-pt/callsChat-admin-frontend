import { z } from 'zod'

/**
 * The environment contract, kept in its own module so the build can validate it
 * without importing `src/env.ts` — that module parses `import.meta.env` on load,
 * which does not exist in the Node context where `vite.config.ts` runs.
 *
 * ONLY browser-safe values belong here. Backend secrets, payment provider keys,
 * private certificates and database credentials must never reach the build output.
 */
export const envSchema = z.object({
  /** Base URL of the backend, e.g. https://staging-api.callchat.app */
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

/** Renders Zod issues as an actionable, multi-line message. */
export function formatEnvIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n')
}
