import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  DisconnectReason as Reasons,
  RemoteAudioTrack,
  Room,
} from 'livekit-client'

import { issueStealthToken } from '@/api/liveRooms'

import { errorText } from './useLiveModeration'

/**
 * Stealth listening (plan.md Live §5.4, phase L6). Super Admin only; the
 * caller checks `live.listen`.
 *
 * Hidden on purpose:
 * - **Listen only.** The panel never publishes. It doesn't ask for the
 *   microphone or camera and never calls `setMicrophoneEnabled`. The server's
 *   token is a VIEWER grant with `stealth: true`, so publishing would be
 *   refused anyway.
 * - **Audio only.** Only remote *audio* tracks are attached. Video tracks are
 *   never subscribed, and data messages (the chat feed) are ignored: the room
 *   chat stays out of the panel (plan.md §0).
 * - **Nothing is recorded.** Tracks are played through `<audio>` elements in a
 *   hidden `<audio>` elements. No MediaRecorder, no download, no buffering.
 *
 * `livekit-client` is loaded only when someone presses Listen. It is about
 * 150 kB and nobody else needs it.
 */

export type ListenState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'connecting' }
  | {
      readonly phase: 'listening'
      readonly speakers: number
      /** The browser blocked autoplay; one more click is needed. */
      readonly blocked: boolean
    }
  | { readonly phase: 'error'; readonly message: string }

const DEFAULT_VOLUME = 0.8

/** Why the line dropped, in words. The reason enum is passed in so it stays lazy-loaded. */
function disconnectText(reason: number | undefined, reasons: typeof Reasons): string {
  switch (reason) {
    case reasons.DUPLICATE_IDENTITY:
      return 'Listening started in another tab or window, so it stopped here. Each admin can listen from one place at a time.'
    case reasons.ROOM_DELETED:
    case reasons.ROOM_CLOSED:
      return 'The stream ended.'
    case reasons.PARTICIPANT_REMOVED:
      return 'The audio server removed this listener.'
    default:
      return 'The connection to the room closed. The stream may have ended, or the network dropped.'
  }
}

export function useStealthListener(roomId: string) {
  const [state, setState] = useState<ListenState>({ phase: 'idle' })
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME)

  const roomRef = useRef<Room | null>(null)
  const tracksRef = useRef(new Map<string, RemoteAudioTrack>())
  const elementsRef = useRef(new Map<string, HTMLMediaElement>())
  const volumeRef = useRef(DEFAULT_VOLUME)
  /** Bumped on every start/stop so a late connect can't revive a stopped session. */
  const sessionRef = useRef(0)

  const teardown = useCallback(() => {
    sessionRef.current += 1
    for (const [sid, track] of tracksRef.current) {
      const element = elementsRef.current.get(sid)
      if (element) track.detach(element)
      else track.detach()
    }
    for (const element of elementsRef.current.values()) element.remove()
    tracksRef.current.clear()
    elementsRef.current.clear()
    const room = roomRef.current
    roomRef.current = null
    if (room) void room.disconnect(true)
  }, [])

  const stop = useCallback(() => {
    teardown()
    setState({ phase: 'idle' })
  }, [teardown])

  const start = useCallback(async () => {
    teardown()
    const session = sessionRef.current
    const stale = () => session !== sessionRef.current
    setState({ phase: 'connecting' })

    try {
      const [grant, livekit] = await Promise.all([
        issueStealthToken(roomId),
        import('livekit-client'),
      ])
      if (stale()) return
      const { DisconnectReason, Room: LiveKitRoom, RoomEvent, Track } = livekit

      const room = new LiveKitRoom({ adaptiveStream: false, dynacast: false })
      roomRef.current = room

      const speakerCount = () => {
        let count = 0
        for (const participant of room.remoteParticipants.values()) {
          for (const publication of participant.audioTrackPublications.values()) {
            if (publication.isSubscribed && !publication.isMuted) {
              count += 1
              break
            }
          }
        }
        return count
      }
      const refresh = () => {
        if (stale()) return
        setState({
          phase: 'listening',
          speakers: speakerCount(),
          blocked: !room.canPlaybackAudio,
        })
      }

      room
        .on(RoomEvent.TrackPublished, (publication) => {
          // Audio only. Video is never fetched.
          if (publication.kind === Track.Kind.Audio) publication.setSubscribed(true)
        })
        .on(RoomEvent.TrackSubscribed, (track, publication) => {
          if (track.kind !== Track.Kind.Audio) {
            publication.setSubscribed(false)
            return
          }
          const audio = track as RemoteAudioTrack
          const element = audio.attach()
          element.volume = volumeRef.current
          // In the document (Safari won't play a detached element), never shown.
          element.hidden = true
          document.body.append(element)
          tracksRef.current.set(publication.trackSid, audio)
          elementsRef.current.set(publication.trackSid, element)
          refresh()
        })
        .on(RoomEvent.TrackUnsubscribed, (track, publication) => {
          const element = elementsRef.current.get(publication.trackSid)
          if (element) {
            track.detach(element)
            element.remove()
          }
          tracksRef.current.delete(publication.trackSid)
          elementsRef.current.delete(publication.trackSid)
          refresh()
        })
        .on(RoomEvent.TrackMuted, refresh)
        .on(RoomEvent.TrackUnmuted, refresh)
        .on(RoomEvent.ParticipantDisconnected, refresh)
        .on(RoomEvent.AudioPlaybackStatusChanged, refresh)
        .on(RoomEvent.Disconnected, (reason) => {
          if (stale()) return
          teardown()
          setState({
            phase: 'error',
            message: disconnectText(reason, DisconnectReason),
          })
        })

      // Manual subscription: video tracks are never downloaded at all.
      await room.connect(grant.livekitUrl, grant.token, { autoSubscribe: false })
      if (stale()) {
        void room.disconnect(true)
        return
      }
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.trackPublications.values()) {
          if (publication.kind === Track.Kind.Audio) publication.setSubscribed(true)
        }
      }
      // Start runs inside the Listen click, so autoplay is normally allowed.
      await room.startAudio().catch(() => undefined)
      refresh()
    } catch (error) {
      if (stale()) return
      teardown()
      setState({
        phase: 'error',
        message: errorText(
          error,
          'Could not join the room to listen. The stream may have ended, or the audio server is unreachable.',
        ),
      })
    }
  }, [roomId, teardown])

  /** Retry playback after the browser blocked autoplay (must run in a click). */
  const resume = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    await room.startAudio().catch(() => undefined)
    setState((current) =>
      current.phase === 'listening'
        ? { ...current, blocked: !room.canPlaybackAudio }
        : current,
    )
  }, [])

  const setVolume = useCallback((next: number) => {
    const clamped = Math.min(1, Math.max(0, next))
    volumeRef.current = clamped
    setVolumeState(clamped)
    for (const element of elementsRef.current.values()) element.volume = clamped
  }, [])

  // Leaving the page, or a new room id, always hangs up.
  useEffect(() => teardown, [roomId, teardown])

  return { state, volume, start, stop, resume, setVolume }
}
