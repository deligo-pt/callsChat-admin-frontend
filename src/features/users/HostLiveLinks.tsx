import { Link, useLocation } from 'react-router'

import { ROUTES } from '@/app/routes'
import { PERMISSIONS } from '@/auth/permissions'
import { useCan } from '@/auth/useAuth'

import { useHostStatus } from './useHostRoster'

/**
 * A host's streams, from their user record (plan.md Live L4).
 *
 * - **Live now · Open room** while they broadcast (from the host roster's
 *   `currentLiveRoomId`).
 * - **Live streams** — the Live streams page filtered to them: the Live now
 *   tab while live, Past streams otherwise.
 *
 * Only for a host, and only with `live.view`. "Back" on the room returns here.
 */
export function HostLiveLinks({ user }: { user: { id: string; isHost: boolean } }) {
  const canView = useCan(PERMISSIONS.liveView)
  const host = useHostStatus(user)
  const { pathname, search } = useLocation()
  if (!canView || !host) return null

  const roomId = host.isLive ? host.currentLiveRoomId : null

  return (
    <>
      {roomId ? (
        <Link
          to={ROUTES.liveStream(roomId)}
          state={{ backTo: `${pathname}${search}` }}
          className="inline-flex items-center gap-1.5 font-medium whitespace-nowrap text-primary hover:underline"
        >
          <span className="size-1.5 rounded-full bg-danger" aria-hidden="true" />
          Live now · Open room
        </Link>
      ) : null}
      <Link
        to={ROUTES.liveStreamsFor({ hostId: user.id, tab: roomId ? 'live' : 'past' })}
        className="font-medium whitespace-nowrap text-primary hover:underline"
      >
        Live streams
      </Link>
    </>
  )
}
