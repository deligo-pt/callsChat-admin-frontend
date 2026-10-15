import { safeHttpsUrl } from '@/lib/safeUrl'

/**
 * Defusing an applicant's intro media (plan.md §4.4, phase H5).
 *
 * ⚠️ **This is a stronger requirement than the two URL guards that came
 * before it, and the difference is the whole reason this file exists.**
 *
 * `feedback.fileUrl` and `bootstrap.storeUrl` become an `href`: a human has to
 * click before anything happens, and a refused value simply renders as inert
 * text. `introMediaUrl` becomes a **`src` on a `<video>` or `<audio>`
 * element** (doc §3 Screen 3) — the browser fetches it on render, with no
 * click and no chance for an operator to notice. There is no "they shouldn't
 * have clicked it" failure mode here; by the time the drawer paints, the
 * request has gone.
 *
 * The value is written by an ordinary applicant and stored verbatim: the
 * service validates it no more than the other two did (plan.md §3.2, and the
 * hostile fixture in `mocks/handlers/hosts.ts` carries
 * `javascript:alert(document.domain)` because that is what this backend
 * accepts).
 */

export type IntroMediaKind = 'video' | 'audio' | 'unknown'

/**
 * The `src` to mount, or `null` when nothing may be mounted at all.
 *
 * ⚠️ `null` is not an error to swallow. `IntroMediaField` renders the raw value
 * as inert text with a visible warning — the operator is reviewing this person,
 * so "they submitted something that cannot be played" is part of what they are
 * judging. Hiding the row would remove evidence from the only person able to
 * act on it.
 */
export function safeIntroMediaSrc(url: string | null | undefined): string | null {
  if (!url) return null

  return safeHttpsUrl(url)
}

/**
 * Which element to mount, inferred from the URL's path.
 *
 * ⚠️ **There is no content type anywhere in this contract.** The doc says
 * "If video/mp4: embed `<video>`. If audio/mp3: embed `<audio>`" — but no
 * response example and no field in the TypeScript snippet carries a MIME type.
 * The only signal available is the file extension on a string the applicant
 * chose, which is why this returns `'unknown'` rather than guessing a default.
 *
 * `'unknown'` is rendered as a link, not as a silently-wrong element: an
 * `<audio>` pointed at a video plays sound with no picture, and a reviewer
 * would judge the applicant on a sample they never actually saw.
 *
 * Parsed via `new URL().pathname` rather than by string-matching the whole
 * value, so `…/intro.mp4?sig=…` and `…/clip.mp3#t=10` are classified by their
 * path and a query string cannot spoof the extension.
 */
export function introMediaKind(url: string | null | undefined): IntroMediaKind {
  if (!url) return 'unknown'

  let pathname: string
  try {
    pathname = new URL(url).pathname.toLowerCase()
  } catch {
    return 'unknown'
  }

  if (/\.(mp4|webm|ogv|mov|m4v)$/.test(pathname)) return 'video'
  if (/\.(mp3|wav|ogg|oga|m4a|aac|flac)$/.test(pathname)) return 'audio'

  return 'unknown'
}
