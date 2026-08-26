import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { ForbiddenError, isAppError } from '@/api/errors'
import { queryKeys } from '@/api/queryKeys'

/**
 * One mutation wrapper for every user action.
 *
 * Centralising it means no action can forget to refresh the record afterwards
 * — a suspend that leaves a stale "Active" badge on screen is worse than one
 * that fails outright, because the operator believes it worked.
 */
export function useUserMutation<TVariables>(options: {
  userId: string
  mutationFn: (variables: TVariables) => Promise<void>
  /** Past-tense confirmation, e.g. "User suspended." */
  successMessage: string
  onSuccess?: () => void
}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: options.mutationFn,
    // A failed action is the operator's to retry deliberately, never automatic.
    retry: false,
    onSuccess: async () => {
      /*
       * Refresh the record AND the directory.
       *
       * The detail view carries the status badge, the restriction list, the
       * session list and the audit history, all of which an action can change —
       * and none of the endpoints return the updated record, so a refetch is
       * the only way to show the true state. The list is invalidated too so a
       * suspended user does not still read "Active" on the way back.
       */
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.users.detail(options.userId),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() }),
      ])

      toast.success(options.successMessage)
      options.onSuccess?.()
    },
    onError: (error) => {
      /*
       * A 403 means the button should not have been offered — the client-side
       * permission map and the backend disagree (plan.md 3A′ #1 is exactly
       * this risk). Re-read the session so the UI corrects itself instead of
       * continuing to show an action that will keep failing.
       *
       * plan.md §3.4: the message stays generic and leaks nothing about why.
       */
      if (error instanceof ForbiddenError) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.session.current })
        toast.error(
          'You do not have permission for that action. Your access may have changed — reload to see the current options.',
        )
        return
      }

      /*
       * plan.md §10.2: the error envelope has no `details[]`, so there is no
       * per-field mapping to do — the server's message is the most specific
       * thing available and is shown verbatim.
       */
      toast.error(
        isAppError(error) ? error.message : 'The action could not be completed.',
      )
    },
  })
}
