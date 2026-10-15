import { AlertTriangle, FileQuestion, Music, Play, Video } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'

import { introMediaKind, safeIntroMediaSrc } from './introMedia'

/**
 * The applicant's intro sample (plan.md §4.4, phase H5; opened on demand H7).
 *
 * ⚠️ **The only element in this panel that mounts a stranger's URL as a `src`.**
 * Everywhere else an unvalidated URL becomes an `href` and a human has to click
 * it. Here the browser fetches, so the guard has to hold before anything is
 * mounted, not before someone decides to trust it.
 *
 * ⚠️ **Nothing is fetched until the operator asks.** Until H7 the player
 * mounted with the drawer and `preload="metadata"` reached for the file on
 * open — so every applicant's media was pulled down by the act of reading their
 * application, whether or not anyone watched it. Three things were wrong with
 * that: it is a request to a stranger's host made from an admin session, it is
 * the one piece of user-submitted content this panel renders at all (§8), and a
 * black rectangle with a spinner dominated a drawer whose actual job is the
 * text around it.
 *
 * So the resting state is a line of type and a button. `src` is set only in the
 * branch that renders after a click, which also means the defused URL never
 * reaches the DOM in the state nobody asked for.
 */

const KIND_COPY = {
  video: { icon: Video, noun: 'Video sample', action: 'Play video' },
  audio: { icon: Music, noun: 'Audio sample', action: 'Play audio' },
} as const

export function IntroMediaField({ url }: { url: string | null | undefined }) {
  /*
   * ⚠️ Local state with no key, deliberately: the drawer unmounts between
   * applications, so an opened player cannot survive into the next record.
   */
  const [open, setOpen] = useState(false)

  if (!url) {
    return (
      <p className="text-body text-foreground-muted">No intro sample was submitted.</p>
    )
  }

  const src = safeIntroMediaSrc(url)

  if (!src) {
    /*
     * ⚠️ Shown, not hidden. The operator is reviewing this person — "they
     * submitted something that cannot be played" is part of what they are
     * judging, and the raw value is the evidence. Dropping the row would take
     * it away from the only person able to act on it.
     *
     * Rendered as text inside a bordered box with no anchor and no `src`:
     * `wrap-anywhere` so a long hostile string cannot widen the drawer.
     */
    return (
      <div className="space-y-1.5">
        <p className="flex items-start gap-2 text-body text-danger-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            This sample cannot be played. It is not an <code>https</code> link, so the
            panel will not load it.
          </span>
        </p>
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 font-mono text-caption wrap-anywhere">
          {url}
        </p>
      </div>
    )
  }

  const kind = introMediaKind(src)

  if (kind === 'video' || kind === 'audio') {
    const { icon: Icon, noun, action } = KIND_COPY[kind]

    if (!open) {
      return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-muted px-3 py-2.5">
          <span className="flex min-w-0 items-center gap-2 text-body">
            <Icon
              className="size-4 shrink-0 text-foreground-muted"
              aria-hidden="true"
            />
            <span className="truncate">{noun}</span>
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            /*
             * ⚠️ "View" alone is the kind of control that reads as nothing in a
             * rotor list. The accessible name says what it opens; the visible
             * label stays short because the row beside it already says which.
             */
            aria-label={`${action} submitted with this application`}
          >
            <Play className="size-4" aria-hidden="true" />
            View
          </Button>
        </div>
      )
    }

    /*
     * ⚠️ No caption track, and none can be invented: an applicant's own
     * uploaded sample has no captions and the service carries no field for
     * one. `jsx-a11y` is not configured in this repo, so there is no rule to
     * suppress — stated here so the gap is a known one rather than an
     * oversight, and so it surfaces if that plugin is ever added.
     *
     * `autoPlay` because the click that mounted this element *was* the request
     * to play it; a second click on the player's own button would be the panel
     * asking twice.
     */
    return kind === 'video' ? (
      <video
        autoPlay
        controls
        preload="metadata"
        src={src}
        className="max-h-72 w-full rounded-md border border-border bg-black"
      />
    ) : (
      <audio autoPlay controls preload="metadata" src={src} className="w-full" />
    )
  }

  /*
   * ⚠️ A link, never a guessed element.
   *
   * There is no content type in this contract (see `introMedia.ts`): the only
   * signal is the extension on a string the applicant chose. An `<audio>`
   * pointed at a video plays sound with no picture, and a reviewer would judge
   * the applicant on a sample they never actually saw.
   */
  return (
    <div className="space-y-1.5">
      <p className="flex items-start gap-2 text-body">
        <FileQuestion
          className="mt-0.5 size-4 shrink-0 text-foreground-muted"
          aria-hidden="true"
        />
        <a
          href={src}
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium wrap-anywhere text-primary hover:underline"
        >
          {src}
        </a>
      </p>
      <p className="text-caption text-foreground-muted">
        The file type could not be determined from the link, so it opens in a new tab
        rather than playing here.
      </p>
    </div>
  )
}
