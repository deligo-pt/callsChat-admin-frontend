import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'

import { queryKeys } from '@/api/queryKeys'
import type { ListParams } from '@/types/common'

import { fetchBackups, triggerBackup } from '../api'

/** Poll cadence while a job is in flight, and how long before giving up. */
const POLL_MS = 3_000
const MAX_POLLS = 20

/**
 * `ListParams` carries an index signature so the client can serialise arbitrary
 * filters; extending it keeps this assignable without widening the two fields
 * this endpoint actually accepts.
 */
export interface BackupListParams extends ListParams {
  readonly page: number
  readonly limit: number
}

/**
 * Backup history, polled only while something is actually running.
 *
 * `POST .../database/backup` answers `202 RUNNING` and then says nothing more:
 * there is no per-job endpoint and no webhook, so the *only* way to learn an
 * outcome is to re-read the list. That makes polling a requirement rather than
 * a nicety — without it the row would sit at "Running" until the operator
 * happened to reload.
 *
 * It stops on two conditions, both deliberate:
 *
 * - **No row is running.** Polling a settled list is pure noise.
 * - **20 attempts (~1 minute).** A job that has neither succeeded nor failed
 *   by then is stuck, and a poll loop that never ends would keep hitting the
 *   API for the rest of the session. The row stays as it is, which is the
 *   honest report: we do not know.
 */
export function useBackupsQuery(params: BackupListParams) {
  const polls = useRef(0)

  return useQuery({
    queryKey: queryKeys.configuration.backups(params),
    queryFn: ({ signal }) => fetchBackups(params, signal),
    staleTime: 0,
    retry: 1,
    refetchInterval: (query) => {
      const running = query.state.data?.items.some((item) => item.status === 'RUNNING')

      if (!running) {
        polls.current = 0
        return false
      }
      if (polls.current >= MAX_POLLS) return false

      polls.current += 1
      return POLL_MS
    },
  })
}

/**
 * Start a backup.
 *
 * Deliberately does **not** report success on resolve. A `202` means the job
 * was accepted, not that it worked — on production today it fails ~20ms later
 * with `spawn pg_dump ENOENT`. The caller says "started"; the table says what
 * happened.
 */
export function useTriggerBackup() {
  const queryClient = useQueryClient()

  const refreshList = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.configuration.all,
      }),
    [queryClient],
  )

  return useMutation({
    mutationFn: triggerBackup,
    retry: false,
    onSuccess: async () => {
      await refreshList()
    },
  })
}
