import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { queryKeys } from '@/api/queryKeys'

import type { SettingsBundle } from '@/api/systemSettings'
import type { RateLimitSettings } from '@/types/settings'

import { fetchSettings, updateRateLimitSettings } from './api'

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
 * shared record and the public config — which must never be left stale after a
 * write, since it is the surface the operator checks to confirm the save
 * reached the app.
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
 * `PATCH /admin/settings/rate-limiting` with the cache kept whole.
 *
 * ⚠️ The route answers with only the eight rate-limit fields (plan.md O2), so
 * they are **merged** into the cached record before the invalidation refetch —
 * replacing it would blank every other section until the refetch landed.
 */
export function useRateLimitMutation(onSuccess?: (saved: RateLimitSettings) => void) {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateSettings()

  return useMutation({
    mutationFn: updateRateLimitSettings,
    retry: false,
    onSuccess: async (saved) => {
      queryClient.setQueryData<SettingsBundle>(
        queryKeys.configuration.settings,
        (old) => (old ? { ...old, settings: { ...old.settings, ...saved } } : old),
      )
      onSuccess?.(saved)
      await invalidate()
    },
  })
}
