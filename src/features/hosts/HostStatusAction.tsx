import { useState } from 'react'
import { toast } from 'sonner'

import { isAppError } from '@/api/errors'
import { repairNotFoundMessage } from '@/api/hosts'
import { ConfirmActionDialog } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import type { LiveHost } from '@/types/hosts'

import { hostName } from './names'
import { useSetLiveHostStatusMutation } from './useHosts'

/**
 * Suspend, ban or reactivate one host (plan.md §4.4, phase H6).
 *
 * ⚠️ **Suspending a host who is live ends their broadcast.** Doc §5.2: the
 * backend terminates the running `LiveRoom`, evicts every viewer, and
 * broadcasts `live:room_ended` with the reason. That is the most destructive
 * action in this module and the one an operator is least likely to expect from
 * a button labelled "Suspend", so the dialog says it in as many words.
 *
 * ⚠️ **The panel cannot confirm the teardown happened.** It has no view of
 * rooms and no endpoint reports one (plan.md O6). The copy therefore states
 * what the backend will do and never claims to have observed it — the
 * difference between "their live room will end" and "their live room ended".
 */

type Action = 'SUSPENDED' | 'BANNED' | 'ACTIVE'

const COPY: Readonly<
  Record<Action, { title: string; confirm: string; effect: string }>
> = {
  SUSPENDED: {
    title: 'Suspend this host',
    confirm: 'Suspend the host',
    effect:
      'They can no longer start a live stream. If they are broadcasting right now, the backend ends that room immediately and everyone watching is disconnected. They are notified, and the reason you write below is sent with it.',
  },
  BANNED: {
    title: 'Ban this host',
    confirm: 'Ban the host',
    effect:
      'They can no longer start a live stream, and any room they are broadcasting right now ends immediately with everyone watching disconnected. A ban is how this panel records a permanent decision rather than a temporary one — reactivating afterwards is possible, but the record of the ban remains.',
  },
  ACTIVE: {
    title: 'Reactivate this host',
    confirm: 'Reactivate the host',
    effect:
      'They can start live streams again. Nothing that ended while they were suspended is restored, and anyone who was watching when their room was torn down is not brought back.',
  },
}

export function HostStatusAction({ host }: { host: LiveHost }) {
  const mutation = useSetLiveHostStatusMutation()
  const [action, setAction] = useState<Action | null>(null)

  const userId = host.userId
  const name = hostName(host)
  const status = (host.status ?? '').toUpperCase()
  const live = status === 'ACTIVE'

  function submit(next: Action, reason: string) {
    if (!userId) return

    mutation.mutate(
      {
        userId,
        /*
         * ⚠️ `reason` is required for BANNED as well as SUSPENDED — verified
         * live, and a fact the doc never states (plan.md §3.3). The payload
         * type encodes it, so this branch is what satisfies the compiler as
         * well as the server.
         */
        payload: next === 'ACTIVE' ? { status: 'ACTIVE' } : { status: next, reason },
      },
      {
        onSuccess: () => {
          setAction(null)
          toast.success(
            next === 'ACTIVE'
              ? `${name} can go live again.`
              : `${name} can no longer go live.`,
          )
        },
        onError: (error) => {
          /*
           * The dialog stays open. The reason an operator typed is sent to the
           * host, and making them write it again because the first attempt
           * 500'd would be the wrong way to fail.
           */
          toast.error(
            isAppError(error)
              ? repairNotFoundMessage(error.message)
              : 'The host status could not be changed.',
          )
        },
      },
    )
  }

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        {live ? (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAction('SUSPENDED')}
              aria-label={`Suspend ${name}`}
            >
              Suspend
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAction('BANNED')}
              aria-label={`Ban ${name}`}
            >
              Ban
            </Button>
          </>
        ) : (
          /*
           * ⚠️ Restoring service is one click behind one dialog, the same as
           * breaking it — but never harder. The bootstrap module settled this:
           * the person undoing the damage is often not the one who caused it.
           */
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAction('ACTIVE')}
            aria-label={`Reactivate ${name}`}
          >
            Reactivate
          </Button>
        )}
      </div>

      {action ? (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => !open && setAction(null)}
          title={COPY[action].title}
          target={name}
          effect={COPY[action].effect}
          severity={action === 'ACTIVE' ? 'info' : 'critical'}
          confirmLabel={COPY[action].confirm}
          loading={mutation.isPending}
          /*
           * ⚠️ Reactivation asks for no reason because the API accepts none:
           * `{ "status": "ACTIVE" }` is the whole body. Suspension and ban both
           * require one of at least 5 characters server-side; the shared dialog
           * asks for 10, and the panel stays the stricter of the two because
           * this text reaches the host.
           */
          reason={action === 'ACTIVE' ? 'none' : 'required'}
          reasonHint={
            action === 'ACTIVE'
              ? undefined
              : 'At least 10 characters. This is sent to the host with their suspension notice — write it for them, not for the log.'
          }
          onConfirm={(reason) => submit(action, reason)}
        />
      ) : null}
    </>
  )
}
