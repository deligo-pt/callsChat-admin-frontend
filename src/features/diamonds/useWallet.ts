import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import {
  adjustWallet,
  approveTopUpRequest,
  createDiamondPackage,
  deleteDiamondPackage,
  fetchDiamondPackages,
  fetchTopUpRequests,
  rejectTopUpRequest,
  updateDiamondPackage,
  type TopUpRequestQuery,
} from '@/api/wallet'
import type {
  AdjustWalletPayload,
  CreatePackagePayload,
  UpdatePackagePayload,
} from '@/types/wallet'
import { queryKeys } from '@/api/queryKeys'

/**
 * Reading the diamond-wallet surfaces (plan.md §5, phase W2).
 */

/**
 * The queue — `GET /admin/wallet/requests`.
 *
 * `keepPreviousData` keeps the current page on screen while the next loads;
 * without it, paging or changing a filter blanks the table to a skeleton,
 * which reads as a broken page rather than a loading one.
 *
 * ⚠️ **This returns an empty page on the real backend today** (plan.md O11).
 * The caller must treat that as the ordinary case, not an error and not a
 * placeholder to be filled in later.
 */
export function useTopUpRequestListQuery(query: TopUpRequestQuery) {
  return useQuery({
    queryKey: queryKeys.topUpRequests.list(query),
    queryFn: ({ signal }) => fetchTopUpRequests(query, signal),
    placeholderData: keepPreviousData,
    staleTime: 0,
  })
}

/**
 * Every package — `GET /admin/wallet/packages`.
 *
 * ⚠️ Includes inactive ones, so this is **not** the storefront. A caller that
 * wants what a user sees must filter on `isActive` itself.
 */
export function useDiamondPackagesQuery() {
  return useQuery({
    queryKey: queryKeys.diamondPackages.all,
    queryFn: ({ signal }) => fetchDiamondPackages(signal),
    staleTime: 0,
  })
}

/**
 * Approving or rejecting one request (plan.md §5, phase W3).
 *
 * ⚠️ **Both invalidate the list, and the list is the only source of truth.**
 * There is no `GET /admin/wallet/requests/:id` — it answers `ROUTE_NOT_FOUND`
 * (measured 2026-10-27) — so the drawer reads its row out of the list cache
 * rather than fetching. That is a real difference from the host application
 * drawer, which fetches precisely so it can notice a record changing
 * underneath an operator. Here nothing can notice it in advance, which is why
 * the `409` on submit is load-bearing rather than a nicety: it is the **only**
 * thing standing between two admins and two reviews of one payment.
 */
export function useApproveTopUpMutation() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => approveTopUpRequest(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.topUpRequests.all })
    },
  })
}

export function useRejectTopUpMutation() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      rejectTopUpRequest(id, reason),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.topUpRequests.all })
    },
  })
}

/**
 * Package writes (plan.md §5, phase W4).
 *
 * ⚠️ **All three invalidate the whole list, and none paints from its
 * response.** There is no `GET /admin/wallet/packages/:id` — it answers
 * `ROUTE_NOT_FOUND` — so the list is the only source of truth, and a response
 * body we have never observed on a populated table is not something to render
 * a row from.
 */
export function useCreatePackageMutation() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (payload: CreatePackagePayload) => createDiamondPackage(payload),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.diamondPackages.all })
    },
  })
}

export function useUpdatePackageMutation() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdatePackagePayload }) =>
      updateDiamondPackage(id, payload),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.diamondPackages.all })
    },
  })
}

export function useDeletePackageMutation() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteDiamondPackage(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.diamondPackages.all })
    },
  })
}

/**
 * A direct balance adjustment (plan.md §5, phase W5).
 *
 * ⚠️ **Nothing to invalidate, and that is itself a finding.** There is no
 * endpoint that reads a wallet balance or the diamond ledger from this panel
 * (plan.md O4), so an adjustment lands somewhere the admin panel cannot see.
 * The success toast is the only feedback there is, and the form says so rather
 * than implying a balance somewhere has visibly moved.
 */
export function useAdjustWalletMutation() {
  return useMutation({
    mutationFn: (payload: AdjustWalletPayload) => adjustWallet(payload),
  })
}
