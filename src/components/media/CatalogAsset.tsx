import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ImageOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/cn'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
import { parseLottie, type LottieDocument } from '@/lib/lottieData'
import { catalogAssetUrl, isLottieAsset, isVideoAsset } from '@/lib/mediaUrl'

import { mountLottie, type AnimationItem } from './lottiePlayer'

/**
 * A catalog asset — gift, emoji or pack cover — drawn as a thumbnail (plan.md
 * §2.4, phase G2).
 *
 * ⚠️ **Catalog assets are the one kind of media this panel renders without a
 * click.** The intro sample and the top-up receipt are user submissions and
 * stay behind a View button. These are different in kind: staff-uploaded
 * platform content, public and CORS-open, and a catalog of animations an
 * operator cannot see is not a catalog they can manage. They are still never
 * *trusted*: the URL goes through `catalogAssetUrl`, the document through
 * `parseLottie`, and the request carries no credentials and no referrer.
 *
 * ⚠️ **Paused by default, playing only under the pointer or keyboard focus.**
 * A grid of eight simultaneously looping 2560×2560 SVG animations is a real
 * CPU cost on an operator's laptop, and motion they did not ask for is noise on
 * a management screen. `prefers-reduced-motion` stops playback entirely.
 */

export interface CatalogAssetProps {
  /** The raw stored value — resolved here, never by the caller. */
  readonly value: string | null | undefined
  /** Plays while true, in addition to the thumbnail's own hover. */
  readonly active?: boolean
  readonly className?: string
}

/** Fetched once per URL for the session: the files are immutable by path. */
async function fetchLottie(url: string, signal: AbortSignal): Promise<LottieDocument> {
  const response = await fetch(url, {
    signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  })
  if (!response.ok) throw new Error(`Asset answered ${response.status}`)
  const parsed = parseLottie(await response.text())
  if (!parsed) throw new Error('Not a Lottie document')
  return parsed
}

export function CatalogAsset({ value, active = false, className }: CatalogAssetProps) {
  const url = catalogAssetUrl(value)
  const frame = cn(
    'relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-muted',
    className,
  )

  if (!value?.trim()) {
    return (
      <span className={frame}>
        <ImageOff className="size-4 text-foreground-muted" aria-hidden="true" />
        <span className="sr-only">No asset</span>
      </span>
    )
  }

  if (!url) {
    /*
     * ⚠️ Shown, not dropped. The raw value is in the tooltip as inert text so
     * the people able to fix the record can see what is stored.
     */
    return (
      <span className={cn(frame, 'border-danger')} title={value}>
        <AlertTriangle className="size-4 text-danger-foreground" aria-hidden="true" />
        <span className="sr-only">Unsafe asset URL</span>
      </span>
    )
  }

  if (isLottieAsset(value)) {
    return <LottieThumb url={url} active={active} className={frame} />
  }
  if (isVideoAsset(value)) {
    return <VideoThumb url={url} active={active} className={frame} />
  }
  return <ImageThumb url={url} className={frame} />
}

function Unavailable({ className }: { className: string }) {
  return (
    <span className={className}>
      <ImageOff className="size-4 text-foreground-muted" aria-hidden="true" />
      <span className="sr-only">Preview unavailable</span>
    </span>
  )
}

function ImageThumb({ url, className }: { url: string; className: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <Unavailable className={className} />

  return (
    <span className={className}>
      <img
        src={url}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className="size-full object-contain"
        onError={() => setFailed(true)}
      />
    </span>
  )
}

/**
 * An `MP4` gift. Muted, inline, metadata only until it is asked to play — the
 * same rule as the Lottie thumbnails, for the same reasons.
 */
function VideoThumb({
  url,
  active,
  className,
}: {
  url: string
  active: boolean
  className: string
}) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const video = useRef<HTMLVideoElement>(null)
  const [hovered, setHovered] = useState(false)
  const [failed, setFailed] = useState(false)
  const playing = (active || hovered) && !reducedMotion

  useEffect(() => {
    const element = video.current
    if (!element) return
    if (playing) void element.play?.()?.catch?.(() => {})
    else element.pause?.()
  }, [playing])

  if (failed) return <Unavailable className={className} />

  return (
    <span
      className={className}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <video
        ref={video}
        src={url}
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
        className="size-full object-contain"
        onError={() => setFailed(true)}
      />
    </span>
  )
}

function LottieThumb({
  url,
  active,
  className,
}: {
  url: string
  active: boolean
  className: string
}) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const container = useRef<HTMLSpanElement>(null)
  const animation = useRef<AnimationItem | null>(null)
  const [hovered, setHovered] = useState(false)
  const [mountFailed, setMountFailed] = useState(false)
  const playing = (active || hovered) && !reducedMotion
  /* Read by the mount callback, which resolves after the hover may have begun. */
  const playingRef = useRef(playing)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  const asset = useQuery({
    queryKey: ['catalog-asset', url],
    queryFn: ({ signal }) => fetchLottie(url, signal),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
  })

  const data = asset.data

  useEffect(() => {
    const element = container.current
    if (!element || !data) return

    let cancelled = false
    mountLottie({ container: element, animationData: data })
      .then((item) => {
        if (cancelled) {
          item.destroy()
          return
        }
        animation.current = item
        /*
         * ⚠️ **The middle frame at rest, not the first.** Gift animations
         * typically fade or scale in from nothing, so frame 0 is often an
         * empty square — a grid of those reads as eight broken thumbnails.
         */
        if (playingRef.current) item.play()
        else item.goToAndStop(Math.floor(item.totalFrames / 2), true)
      })
      .catch(() => {
        if (!cancelled) setMountFailed(true)
      })

    return () => {
      cancelled = true
      animation.current?.destroy()
      animation.current = null
    }
  }, [data])

  useEffect(() => {
    const item = animation.current
    if (!item) return
    if (playing) item.play()
    else item.goToAndStop(Math.floor(item.totalFrames / 2), true)
  }, [playing])

  if (asset.isError || mountFailed) return <Unavailable className={className} />

  return (
    <span
      className={className}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {asset.isPending ? (
        <span className="absolute inset-0 animate-pulse bg-surface-muted" />
      ) : null}
      <span ref={container} className="size-full" aria-hidden="true" />
    </span>
  )
}
