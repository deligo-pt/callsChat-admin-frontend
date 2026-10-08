import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { fetchBootstrapConfig, updateBootstrapConfig } from '@/api/bootstrap'
import { queryKeys } from '@/api/queryKeys'
import {
  bootstrapAppTypeSchema,
  bootstrapPlatformSchema,
  BOOTSTRAP_APP_TYPES,
  BOOTSTRAP_PLATFORMS,
  type BootstrapAppType,
  type BootstrapConfig,
  type BootstrapPlatform,
  type BootstrapRecordKey,
  type UpdateBootstrapPayload,
} from '@/types/bootstrap'

/**
 * Reading the bootstrap configuration (plan.md §7, phase B1).
 *
 * Two rules, both from §3 rather than chosen here:
 *
 * - **`staleTime: 0`, and refetch on window focus.** There is no concurrency
 *   control on this endpoint (§3.5): two operators editing at once means last
 *   write wins, silently. Refetching when the tab regains focus is the only
 *   moment the panel can notice that somebody else moved `configVersion` while
 *   it was in the background.
 * - **Keyed on `(platform, appType)`.** The four are independent records,
 *   verified by writing to one and watching the others stay put. Keyed on
 *   `platform` alone, opening Business would serve the cached Personal record
 *   for the same platform — an operator editing and saving something they were
 *   never shown (plan.md §2.1).
 */
export function useBootstrapQuery(
  platform: BootstrapPlatform,
  appType: BootstrapAppType,
) {
  return useQuery({
    queryKey: queryKeys.configuration.bootstrap(platform, appType),
    queryFn: ({ signal }) => fetchBootstrapConfig(platform, appType, signal),
    staleTime: 0,
    refetchOnWindowFocus: true,
    /*
     * One retry, matching the settings query. A failure here is usually a
     * token that expired while the tab was open, which the client refreshes
     * and retries successfully.
     */
    retry: 1,
  })
}

/**
 * Which platform the screen is showing, owned by the URL.
 *
 * `?platform=IOS` deep-links, survives a reload, and can be pasted to a
 * colleague — the same rule the feedback queue applies to its filters. It is a
 * view of one screen rather than two screens, so it is a query parameter and
 * not a route segment (§4.1).
 *
 * ⚠️ An unrecognised value falls back to `ANDROID` rather than erroring. That
 * matches the API, which serves the Android record for a missing parameter —
 * but note the asymmetry found in B0: the API *rejects* a bad value on read
 * (`400 querystring/platform`) while accepting a missing one. The panel never
 * forwards a value it has not recognised, so that 400 is unreachable from
 * here.
 */
export function useBootstrapPlatform(): {
  readonly platform: BootstrapPlatform
  readonly setPlatform: (next: BootstrapPlatform) => void
  readonly platforms: readonly BootstrapPlatform[]
} {
  const [searchParams, setSearchParams] = useSearchParams()

  const platform = useMemo<BootstrapPlatform>(() => {
    const raw = searchParams.get('platform')?.trim().toUpperCase()
    const parsed = bootstrapPlatformSchema.safeParse(raw)
    return parsed.success ? parsed.data : 'ANDROID'
  }, [searchParams])

  const setPlatform = useCallback(
    (next: BootstrapPlatform) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current)
          /* Android is the default, so it stays out of the URL entirely. */
          if (next === 'ANDROID') params.delete('platform')
          else params.set('platform', next)
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  return { platform, setPlatform, platforms: BOOTSTRAP_PLATFORMS }
}

/**
 * Which app edition the screen is showing, owned by the URL.
 *
 * The mirror of `useBootstrapPlatform`, deliberately: `?appType=BUSINESS`
 * deep-links, survives a reload, and can be pasted to a colleague. `PERSONAL`
 * is the default and stays **out** of the URL, the same rule `ANDROID` follows.
 *
 * ⚠️ An unrecognised value falls back to `PERSONAL` rather than erroring, which
 * matches both the API and the platform hook. Note the same asymmetry B0 found
 * for `platform`: the API *rejects* a bad value on read
 * (`400 querystring/appType`) while accepting a missing one. The panel never
 * forwards a value it has not recognised, so that 400 is unreachable from here.
 *
 * ⚠️ **Falling back to the default is not harmless here the way it is for
 * platform.** `ANDROID/PERSONAL` is the only one of the four records that is
 * live in production (plan.md §2.1), so a typo'd `?appType=` lands the operator
 * on the real users' app rather than on an unused one. That is why the switcher
 * states the selection rather than relying on a highlighted segment alone.
 */
export function useBootstrapAppType(): {
  readonly appType: BootstrapAppType
  readonly setAppType: (next: BootstrapAppType) => void
  readonly appTypes: readonly BootstrapAppType[]
} {
  const [searchParams, setSearchParams] = useSearchParams()

  const appType = useMemo<BootstrapAppType>(() => {
    const raw = searchParams.get('appType')?.trim().toUpperCase()
    const parsed = bootstrapAppTypeSchema.safeParse(raw)
    return parsed.success ? parsed.data : 'PERSONAL'
  }, [searchParams])

  const setAppType = useCallback(
    (next: BootstrapAppType) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current)
          /* Personal is the default, so it stays out of the URL entirely. */
          if (next === 'PERSONAL') params.delete('appType')
          else params.set('appType', next)
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  return { appType, setAppType, appTypes: BOOTSTRAP_APP_TYPES }
}

/**
 * Writing the bootstrap configuration (plan.md §7, phase B2).
 *
 * ⚠️ **A save is live, globally, on the next request.** Verified: a `PATCH`
 * was visible on the unauthenticated public endpoint immediately afterwards.
 * There is no draft and no staging, which is why the cards that can stop the
 * product do not use this hook until B3 wires them through a confirmation.
 *
 * Three rules:
 *
 * - **`retry: false`.** A retried `PATCH` that actually succeeded the first
 *   time would increment `configVersion` twice, and on a route with no
 *   idempotency key that is the only trace it leaves.
 * - **Invalidates only this record's query.** The four are independent
 *   (§2.1); invalidating the others would refetch records nothing touched.
 * - **Nothing is seeded into the cache from the response.** The caller gets
 *   the saved record to re-seed its own form — so the server's normalisation
 *   is what shows — and the screen redraws from the refetch.
 *
 * `onSaved` receives the record the server actually stored, which is also how
 * a caller can compare `configVersion` and notice a concurrent write (§3.5).
 */
export function useUpdateBootstrapMutation(
  key: BootstrapRecordKey,
  onSaved?: (saved: BootstrapConfig) => void,
) {
  const queryClient = useQueryClient()
  const queryKey = queryKeys.configuration.bootstrap(key.platform, key.appType)

  return useMutation({
    mutationFn: (payload: UpdateBootstrapPayload) => updateBootstrapConfig(payload),
    retry: false,
    onSuccess: async (saved) => {
      onSaved?.(saved)
      await queryClient.invalidateQueries({ queryKey })
    },
    mutationKey: [...queryKey, 'update'],
  })
}
