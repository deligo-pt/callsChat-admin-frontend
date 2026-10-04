import { Eye, Image, Megaphone, Pin, Video } from 'lucide-react'

import { cn } from '@/lib/cn'
import { formatBytes, formatCompact, formatDuration } from '@/lib/format'
import { useActorName } from '@/lib/hooks/useActorName'
import type { Announcement } from '@/types/announcement'

import { audienceLabel } from './labels'

/**
 * Cell renderers for the announcements queue.
 *
 * Separated from `announcementColumns.tsx` so that file exports only its column
 * configuration — a module mixing component and non-component exports breaks
 * React Fast Refresh.
 *
 * Two rules run through all of them:
 *
 * 1. **Every field may be absent.** No announcement row has ever been observed
 *    (O5), so the schema marks all but `id`, `title` and `content` as optional
 *    and nullable. A cell that assumed presence would not render a blank — it
 *    would throw and take the queue with it.
 * 2. **`title` and `content` are our own copy, but `actionUrl` is not
 *    trustworthy input.** The service does not URL-validate it, so anything an
 *    operator typed is in there. It is rendered as text and never as a link.
 */

/**
 * The announcement itself: headline, a clamped line of body copy, and the pin.
 *
 * ⚠️ The pin marker sits here rather than in its own column on purpose. Pinning
 * changes where a row *is* — pinned rows sort first — so it belongs with the
 * thing that moved, not in a column an operator has to scan across to.
 */
export function TitleCell({ record }: { record: Announcement }) {
  return (
    /*
     * ⚠️ `min-w-[11rem]`, and it is load-bearing. `wrap-anywhere` below lowers
     * the headline's min-content width to a single character, which lets the
     * table's auto layout crush this cell — measured at **105px wide and 420px
     * tall**, a 21-line row, on the 255-character fixture. The floor keeps the
     * wrapped block readable; `line-clamp-2` keeps it short.
     */
    <span className="flex min-w-[11rem] flex-col gap-0.5">
      <span className="flex min-w-0 items-start gap-1.5">
        {record.isPinned ? (
          <Pin
            className="mt-1 size-3.5 shrink-0 text-foreground-muted"
            aria-hidden="true"
          />
        ) : null}
        {/*
         * ⚠️ Three classes, each answering a different failure on the same
         * value:
         *
         * - `wrap-anywhere`, not `truncate` or `break-words` — a title may be
         *   255 characters of unbroken text with no break opportunity in it,
         *   and `break-words` finds none, so the cell would demand its whole
         *   min-content width and push the table into a horizontal scroll.
         * - `line-clamp-2` — wrapping alone produced the 21-line row above. Two
         *   lines is enough to tell near-identical headlines apart, which is all
         *   this column is for.
         * - `title` — so the clamped remainder stays reachable on hover, and the
         *   editor holds the whole value.
         */}
        <span
          className="line-clamp-2 min-w-0 font-medium wrap-anywhere"
          title={record.title}
        >
          {record.title}
        </span>
        {record.isPinned ? <span className="sr-only">(pinned)</span> : null}
      </span>

      {/*
       * One line of the body, clamped. An operator scanning a queue of
       * near-identical headlines needs to tell two "Scheduled maintenance"
       * entries apart, and the first few words of the body is what does it.
       */}
      <span className="line-clamp-1 text-caption text-foreground-muted">
        {record.content}
      </span>
    </span>
  )
}

/**
 * What is attached, if anything.
 *
 * ⚠️ **Deliberately does not render the media.** A thumbnail per row would
 * fetch every image in the queue from a public CDN on every page load, and the
 * one thing this cell must communicate is not what the picture looks like — it
 * is that an attachment exists and is **permanent**, because `/media/upload`
 * has no delete route (plan.md §3.4).
 */
export function MediaCell({ record }: { record: Announcement }) {
  if (!record.mediaUrl && !record.mediaKey) {
    return <span className="text-caption text-foreground-subtle">—</span>
  }

  const isVideo = record.mediaType === 'VIDEO'
  const Icon = isVideo ? Video : Image

  /*
   * Size and duration are both optional, and a video with neither is perfectly
   * possible — the service accepts media with no metadata at all. Whatever is
   * known gets shown; nothing is invented to fill the line.
   */
  const detail = [
    isVideo && typeof record.mediaDuration === 'number'
      ? formatDuration(record.mediaDuration)
      : null,
    typeof record.mediaSize === 'number' ? formatBytes(record.mediaSize) : null,
  ].filter(Boolean)

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Icon className="size-4 shrink-0 text-foreground-muted" aria-hidden="true" />
      <span className="min-w-0 truncate">
        {isVideo ? 'Video' : 'Image'}
        {detail.length > 0 ? (
          <span className="text-foreground-muted"> · {detail.join(' · ')}</span>
        ) : null}
      </span>
    </span>
  )
}

/** Who it was addressed to. */
export function AudienceCell({ record }: { record: Announcement }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Megaphone className="size-4 shrink-0 text-foreground-muted" aria-hidden="true" />
      <span className="truncate">{audienceLabel(record.targetAudience, true)}</span>
    </span>
  )
}

/**
 * Impressions on this row.
 *
 * ⚠️ **`viewsCount` is an impression counter, not a reader count**, and the
 * label says "views" rather than "read" for that reason. `broadcast.md` §3.4
 * increments it on every fetch of the detail route, so one person opening an
 * announcement four times counts four times. Calling it "read by 1,420 people"
 * would be a claim the number cannot support.
 *
 * A draft shows an em dash rather than `0`: nobody could have seen it, so a
 * zero would invite the reading that nobody *did*.
 */
export function ReachCell({ record }: { record: Announcement }) {
  if (record.status === 'DRAFT' || typeof record.viewsCount !== 'number') {
    return <span className="text-caption text-foreground-subtle">—</span>
  }

  return (
    <span className="flex items-center gap-1.5">
      <Eye className="size-4 shrink-0 text-foreground-muted" aria-hidden="true" />
      <span>
        {formatCompact(record.viewsCount)}
        <span className="sr-only">
          {' '}
          views, counting repeat opens by the same person
        </span>
      </span>
    </span>
  )
}

/**
 * Who wrote it.
 *
 * Three sources, in order: the expanded `author.profile.displayName` if the
 * service sent one, then `useActorName` resolving `authorId` the way every
 * other actor id in this panel is resolved, then the raw id.
 *
 * ⚠️ All three can fail. `authorId` is nullable, the staff directory is
 * Super-Admin-only, and the author may be an account that no longer exists — so
 * the last fallback is a sentence rather than a blank cell.
 */
export function AuthorCell({ record }: { record: Announcement }) {
  const resolveActor = useActorName()

  const expanded = record.author?.profile?.displayName
  const resolved = expanded ?? resolveActor(record.authorId)

  if (!resolved) {
    return (
      <span className="truncate text-caption text-foreground-subtle italic">
        {record.authorId ? 'Name unavailable' : 'No author recorded'}
      </span>
    )
  }

  return (
    <span className={cn('block min-w-0 truncate')} title={resolved}>
      {resolved}
    </span>
  )
}
