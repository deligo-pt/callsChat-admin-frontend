import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'

import { ConflictError, isAppError, NotFoundError } from '@/api/errors'
import { queryKeys } from '@/api/queryKeys'
import {
  approveWithdrawal,
  fetchWithdrawal,
  fetchWithdrawals,
  fetchWithdrawalSettings,
  fetchWithdrawalStats,
  markWithdrawalPaid,
  rejectWithdrawal,
  updateWithdrawalSettings,
  withdrawalParams,
  type WithdrawalQuery,
} from '@/api/withdrawals'
import type { WithdrawalSettingsPatch } from '@/types/withdrawals'

/**
 * Reads and writes for host withdrawals (plan.md W1–W4).
 *
 * The list and the counters refresh every 30 s while the tab is visible
 * (decision 6). Every write refetches everything under `withdrawals`, plus
 * hosts and users, whose balances it changes.
 */

export const WITHDRAWAL_REFRESH_MS = 30_000

export function useWithdrawalsQuery(query: WithdrawalQuery) {
  return useQuery({
    queryKey: queryKeys.withdrawals.list(withdrawalParams(query)),
    queryFn: ({ signal }) => fetchWithdrawals(query, signal),
    placeholderData: keepPreviousData,
    refetchInterval: WITHDRAWAL_REFRESH_MS,
  })
}

export function useWithdrawalStats() {
  return useQuery({
    queryKey: queryKeys.withdrawals.stats(),
    queryFn: ({ signal }) => fetchWithdrawalStats(signal),
    refetchInterval: WITHDRAWAL_REFRESH_MS,
  })
}

export function useWithdrawal(id: string) {
  return useQuery({
    queryKey: queryKeys.withdrawals.detail(id),
    queryFn: ({ signal }) => fetchWithdrawal(id, signal),
    enabled: id.length > 0,
    retry: (count, error) => (error instanceof NotFoundError ? false : count < 1),
  })
}

export function useWithdrawalSettings(enabled = true) {
  return useQuery({
    queryKey: queryKeys.withdrawals.settings(),
    queryFn: ({ signal }) => fetchWithdrawalSettings(signal),
    enabled,
  })
}

export type WithdrawalWrite =
  | { kind: 'approve'; id: string }
  | { kind: 'reject'; id: string; rejectReason: string; adminNote: string }
  | { kind: 'markPaid'; id: string; transactionRef: string; adminNote: string }

const SUCCESS: Record<WithdrawalWrite['kind'], string> = {
  approve: 'Approved. Send the money, then mark it as paid.',
  reject: 'Rejected. The diamonds are back in the host’s balance.',
  markPaid: 'Marked as paid. The host has been told.',
}

function run(write: WithdrawalWrite): Promise<string> {
  switch (write.kind) {
    case 'approve':
      return approveWithdrawal(write.id)
    case 'reject':
      return rejectWithdrawal(write.id, {
        rejectReason: write.rejectReason,
        adminNote: write.adminNote,
      })
    case 'markPaid':
      return markWithdrawalPaid(write.id, {
        transactionRef: write.transactionRef,
        adminNote: write.adminNote,
      })
  }
}

/**
 * Words for a failed write. A conflict means the request moved on in the
 * meantime — someone else acted, or the host cancelled.
 */
export function withdrawalErrorText(error: unknown): string {
  if (error instanceof NotFoundError) return 'This withdrawal no longer exists.'
  if (
    error instanceof ConflictError ||
    (isAppError(error) &&
      (error.status === 409 || error.code === 'INVALID_STATE_TRANSITION'))
  ) {
    return `This request has already been processed or cancelled, so the action was not applied. The page has been refreshed.${
      error instanceof Error && error.message ? ` (${error.message})` : ''
    }`
  }
  return isAppError(error) && error.message
    ? error.message
    : 'The action could not be completed. Nothing was changed.'
}

async function refreshAll(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.withdrawals.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.hosts.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all }),
  ])
}

export function useWithdrawalWrite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: run,
    retry: false,
    onSuccess: async (message, write) => {
      toast.success(message.trim() || SUCCESS[write.kind])
      await refreshAll(queryClient)
    },
    onError: async (error) => {
      toast.error(withdrawalErrorText(error))
      // Whatever happened, show the request as it is now.
      await queryClient.invalidateQueries({ queryKey: queryKeys.withdrawals.all })
    },
  })
}

export function useUpdateWithdrawalSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: WithdrawalSettingsPatch) => updateWithdrawalSettings(patch),
    retry: false,
    onSuccess: async (message) => {
      toast.success(message.trim() || 'Withdrawal settings saved.')
      await queryClient.invalidateQueries({ queryKey: queryKeys.withdrawals.all })
    },
    onError: (error) => {
      toast.error(
        isAppError(error) && error.message
          ? error.message
          : 'The settings could not be saved. Nothing was changed.',
      )
    },
  })
}
