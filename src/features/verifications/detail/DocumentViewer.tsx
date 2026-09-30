import { AlertTriangle, FileWarning } from 'lucide-react'
import { useEffect, useState } from 'react'

import { isAppError, NotFoundError } from '@/api/errors'
import { fetchVerificationDocument } from '@/api/verifications'
import { Spinner } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  VERIFICATION_VIEWABLE_IMAGE_TYPES,
  VERIFICATION_VIEWABLE_PDF_TYPE,
  type VerificationDocument,
} from '@/types/verification'

import { formatBytes } from '../labels'

/**
 * One decrypted identity document, on screen and nowhere else (plan.md §3.3,
 * §5.4).
 *
 * ⚠️ **This component is the only thing in the panel that can reach the
 * decrypted stream, and mounting it is an audited act.** The backend writes a
 * `VIEWED_DOCUMENT` row carrying the acting admin's id, IP address and user
 * agent on every single request. So the fetch is deliberately tied to *mount*,
 * and the parent mounts this only from a click:
 *
 * - there is no `open` prop and no hidden pre-mounted instance — closing
 *   unmounts, and reopening is a new, honest, audited view;
 * - **revoke-on-close and revoke-on-unmount are therefore one code path**, not
 *   two guarantees that can drift apart;
 * - it does **not** use TanStack Query. A cache would either hand back a blob
 *   whose URL has already been revoked, or dedupe/refetch on its own schedule —
 *   and an automatic refetch here forges a record of a human opening a
 *   stranger's passport. `api/queryKeys.ts` says the same thing: documents get
 *   no key.
 *
 * ⚠️ **One mount tree at every width, not a Sheet↔Dialog swap.** plan.md §6
 * asked for a full-screen sheet below `md` and a centred dialog above. Swapping
 * the component on a media query would unmount the viewer when the viewport
 * crosses 768px — revoking the blob mid-read and forcing a **second audited
 * fetch** to see the same document again. So it is one `Dialog`, sized by
 * Tailwind: full-bleed below `sm`, centred and tall above it. Recorded as a V3
 * decision that amends §6.
 */

interface DocumentViewerProps {
  /** Used to build the path. Never taken from the manifest's `previewUrl`. */
  readonly verificationId: string
  readonly document: VerificationDocument
  readonly onClose: () => void
}

/**
 * A blob URL and what the vault said the bytes are.
 *
 * ⚠️ The **URL**, not the `Blob`. `URL.createObjectURL` is called in the fetch
 * callback rather than in an effect, which is what lets the revoke live in an
 * effect whose body does nothing at all — see {@link DocumentViewer}. A leaked
 * blob URL outlives the page that made it, and anyone holding the string can
 * read a decrypted national ID for as long as the tab is open.
 */
type Loaded = { readonly url: string; readonly contentType: string }

export function DocumentViewer({
  verificationId,
  document: manifest,
  onClose,
}: DocumentViewerProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<unknown>(null)
  /** Bumped by Retry — re-runs the fetch, and is itself another audited view. */
  const [attempt, setAttempt] = useState(0)

  /*
   * The fetch. Keyed on mount, the document and `attempt`, and on nothing else —
   * no dependency here may be a value that changes while the document is open,
   * or the panel would re-request a national ID because a parent re-rendered.
   */
  useEffect(() => {
    const controller = new AbortController()
    let live = true

    fetchVerificationDocument(verificationId, manifest.docIndex, controller.signal)
      .then((result) => {
        /*
         * ⚠️ The guard comes **before** `createObjectURL`, not after. Creating
         * one here and then discarding it because the operator closed the dialog
         * mid-fetch would leak a URL to a decrypted document that nothing is
         * left mounted to revoke.
         */
        if (!live) return
        setLoaded({
          url: URL.createObjectURL(result.blob),
          contentType: result.contentType,
        })
      })
      .catch((cause: unknown) => {
        /* An abort is the operator closing the dialog, not a failure. */
        if (live && !controller.signal.aborted) setError(cause)
      })

    return () => {
      live = false
      controller.abort()
    }
  }, [verificationId, manifest.docIndex, attempt])

  /*
   * ⚠️ The revoke, and the whole reason this effect exists. Its body does
   * nothing; the cleanup is the point. React runs it when the component
   * unmounts — which is what closing the dialog does — and when `loaded`
   * changes, which is what Retry does. One guarantee, one line, no branch that
   * can be forgotten.
   */
  useEffect(() => {
    if (!loaded) return
    const { url } = loaded
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [loaded])

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        /*
         * Full-bleed on a phone, centred and tall from `sm` up.
         * `overflow-hidden` on the shell with the scroll on the body, so the
         * header and its audit line stay put while a multi-page scan is read.
         */
        className="flex h-dvh max-h-dvh w-full max-w-full flex-col gap-0 overflow-hidden p-0 sm:h-[90vh] sm:max-w-3xl"
      >
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3 sm:px-6">
          {/*
           * ⚠️ `originalName` is attacker-controlled free text off an upload, and
           * it is the title because it is what the operator asked to open. Text
           * only, `wrap-anywhere`, never an href and never a download name.
           *
           * It comes from the manifest rather than the response's
           * `Content-Disposition`, which is unreadable cross-origin — see the
           * note in `api/verifications.ts`.
           *
           * `leading-snug` overrides the primitive's `leading-none`, because a
           * long upload name wraps to two or three lines here.
           */}
          <DialogTitle className="pr-8 leading-snug wrap-anywhere">
            {manifest.originalName}
          </DialogTitle>
          <DialogDescription>
            {formatBytes(manifest.sizeBytes)} · {manifest.mimeType} ·{' '}
            {/*
             * Past tense, deliberately. The list says opening a document *is*
             * recorded; by the time this is on screen the row exists. An
             * operator should read it as a fact about what they have just done.
             */}
            this view has been recorded against your name and IP address.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto bg-surface-sunken">
          {error ? (
            <ViewerError
              error={error}
              onRetry={() => {
                /*
                 * An event handler, so the reset is allowed to live here — and
                 * clearing `loaded` is what triggers the revoke above.
                 */
                setLoaded(null)
                setError(null)
                setAttempt((value) => value + 1)
              }}
            />
          ) : loaded ? (
            <ViewerFrame loaded={loaded} manifest={manifest} />
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <Spinner size="lg" label="Decrypting document" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ViewerFrame({
  loaded,
  manifest,
}: {
  loaded: Loaded
  manifest: VerificationDocument
}) {
  /*
   * ⚠️ The renderer is chosen from the **response's** content type, not the
   * manifest's. The manifest is what the applicant's client claimed at upload
   * time; the response is what the vault actually holds. Rendering a
   * `text/html` body as an image is a broken picture, and rendering it as a
   * document is a stored-XSS surface — so anything off the two allowlists falls
   * through to the unsupported state below.
   */
  if (VERIFICATION_VIEWABLE_IMAGE_TYPES.includes(loaded.contentType)) {
    return (
      <div className="flex min-h-full items-center justify-center p-4">
        <img
          src={loaded.url}
          /*
           * The file name, because a compliance officer describing what they saw
           * needs the document named. Not a description of the contents — nobody
           * here has read them.
           */
          alt={manifest.originalName}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    )
  }

  if (loaded.contentType === VERIFICATION_VIEWABLE_PDF_TYPE) {
    return (
      <iframe
        src={loaded.url}
        title={manifest.originalName}
        /*
         * ⚠️ `src` is a `blob:` URL, never the API path. An `<iframe>` pointed
         * at `/document/:index` would send a credential-less request, 401, and
         * look merely broken — while a signed-in operator would see it work and
         * conclude the path is safe to share.
         */
        className="size-full border-0 bg-surface"
      />
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <FileWarning className="size-6 text-foreground-muted" aria-hidden="true" />
      <p className="text-body">
        This file cannot be displayed here — the vault returned{' '}
        <span className="wrap-anywhere">{loaded.contentType}</span>.
      </p>
      {/*
       * ⚠️ No download offered, here least of all. The one place an operator
       * most wants an escape hatch is the one file type the panel cannot render,
       * and handing it over writes an unencrypted identity document to their
       * disk — outside every guarantee the vault makes (plan.md §1.2).
       */}
      <p className="text-caption text-foreground-muted">
        Ask the applicant to resubmit it as a PDF or an image. It cannot be downloaded
        from the panel.
      </p>
    </div>
  )
}

/**
 * When the bytes do not arrive (plan.md §5.7).
 *
 * ⚠️ **A document that fails to decrypt is not a page that failed to load**, and
 * the difference decides what the operator does next: retry, or reject the
 * application and tell the applicant to resubmit. So this states which of the
 * two it is, and stays inside the open viewer rather than closing and toasting —
 * closing loses the distinction, and the operator's place in the queue with it.
 */
function ViewerError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  /* `404` on this route has two distinct live messages, both verified. */
  const isMissing = error instanceof NotFoundError
  const detail = isAppError(error) ? error.message : null

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <AlertTriangle className="size-6 text-danger-foreground" aria-hidden="true" />

      <p className="text-body">
        {isMissing
          ? 'This document is no longer in the vault. It may have been removed after the application was filed.'
          : 'This document could not be decrypted. It may be corrupt, or it was encrypted with a key this service no longer holds.'}
      </p>

      {detail ? (
        <p className="text-caption wrap-anywhere text-foreground-muted">{detail}</p>
      ) : null}

      <p className="text-caption text-foreground-muted">
        {isMissing
          ? 'The applicant will need to resubmit it.'
          : 'If it fails again, the applicant will need to resubmit it.'}
      </p>

      {isMissing ? null : (
        /*
         * Offered only where a retry can succeed. A 404 will 404 again, and a
         * button that cannot work is worse here than no button: each press is
         * another audited view, and a trail saying an admin opened one document
         * four times reads like suspicion rather than like a broken file.
         */
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}

      <p className="text-caption text-foreground-subtle">
        The attempt was recorded either way.
      </p>
    </div>
  )
}
