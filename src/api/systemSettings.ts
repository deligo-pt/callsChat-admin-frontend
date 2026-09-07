import { apiClient } from '@/api/client'
import {
  adminSettingsResponseSchema,
  type AppVersionPolicies,
  type SystemSettings,
} from '@/types/settings'
import type { z } from 'zod'

/**
 * `GET /admin/settings` — the settings singleton plus both version policies.
 *
 * This one read lives in `api/` rather than in `features/settings/` because
 * two layers need it and they are not allowed to import each other: the
 * settings screens, and the maintenance banner rendered by `AdminLayout` on
 * every page. `eslint.config.js` forbids `layouts/**` from reaching into
 * `features/*`, and duplicating the fetch would give the banner and the page
 * separate cache entries that could disagree about whether the product is
 * down — the one thing this data must never do.
 *
 * Everything else about system settings stays in `features/settings/api.ts`.
 */
export interface SettingsBundle {
  readonly settings: SystemSettings
  readonly appVersionPolicies: AppVersionPolicies
}

export async function fetchSettings(signal?: AbortSignal): Promise<SettingsBundle> {
  const response = await apiClient.get<z.infer<typeof adminSettingsResponseSchema>>(
    '/admin/settings',
    {
      schema: adminSettingsResponseSchema,
      resource: 'system-settings',
      ...(signal ? { signal } : {}),
    },
  )
  return response.data
}
