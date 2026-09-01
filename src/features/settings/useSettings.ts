import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { queryKeys } from '@/api/queryKeys'

import { fetchDeploymentInfo, fetchSettings } from './api'

/**
 * The settings singleton, shared by every tab.
 *
 * One query, not one per tab: the four write routes all mutate the same
 * `system_settings` row and all answer with the whole record, so separate
 * queries would show an operator a stale `appName` on one tab moments after
 * they changed it on another.
 */
export function useSettingsQuery() {
  return useQuery({
    queryKey: queryKeys.configuration.settings,
    queryFn: ({ signal }) => fetchSettings(signal),
    /*
     * Always read live. This screen decides what every CallsChat client
     * receives, and acting on a cached view of it is how two admins overwrite
     * each other without either noticing.
     */
    staleTime: 0,
    retry: 1,
  })
}

/**
 * Invalidate everything a settings write can affect.
 *
 * `configuration.all` is the root of the settings keys, so this catches the
 * shared record, the deployment view that embeds the same version policies,
 * and the public config — which must never be left stale after a write, since
 * it is the surface the operator checks to confirm the save reached the app.
 */
export function useInvalidateSettings() {
  const queryClient = useQueryClient()

  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.configuration.all }),
    [queryClient],
  )
}

/**
 * A settings mutation with the invalidation already wired.
 *
 * `retry: false` throughout: these are writes to production configuration, and
 * silently replaying one that may already have applied is worse than showing
 * the operator a failure they can act on.
 */
export function useSettingsMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  onSuccess?: (result: TResult) => void,
) {
  const invalidate = useInvalidateSettings()

  return useMutation({
    mutationFn,
    retry: false,
    onSuccess: async (result) => {
      onSuccess?.(result)
      await invalidate()
    },
  })
}

/**
 * Backend build information plus both mobile release policies.
 *
 * A separate query from the settings singleton: `GET /admin/settings/deployment`
 * is the only source of the runtime stats, and its `uptimeSeconds` is stale the
 * moment it arrives — so this is refetched on mount rather than shared with the
 * long-lived settings read.
 */
export function useDeploymentQuery() {
  return useQuery({
    queryKey: queryKeys.configuration.deployment,
    queryFn: ({ signal }) => fetchDeploymentInfo(signal),
    staleTime: 0,
    retry: 1,
  })
}
