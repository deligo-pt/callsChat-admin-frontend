import { Eye, FileText, FileWarning, Image } from 'lucide-react'
import { useState } from 'react'

import { DateTime } from '@/components/display'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  VERIFICATION_VIEWABLE_IMAGE_TYPES,
  VERIFICATION_VIEWABLE_PDF_TYPE,
  type Verification,
  type VerificationDocument,
} from '@/types/verification'

import { formatBytes } from '../labels'
import { DocumentViewer } from './DocumentViewer'

/**
 * What was submitted — **the manifest, never the bytes** (plan.md §5.4).
 *
 * V2 renders the list. V3 adds the viewer, and the split is deliberate: this
 * card can ship and be reviewed without anything in the codebase yet being able
 * to fetch a decrypted identity document.
 *
 * ⚠️ **Nothing here fetches.** Not on mount, not on hover, not speculatively.
 * Every call to the document route writes a permanent audit row naming the
 * acting admin and their IP address — confirmed live, `VIEWED_DOCUMENT` rows
 * are real (§3.3) — so a prefetch would forge a record of a human opening a
 * stranger's passport. `useVerifications.ts` has no document hook for the same
 * reason.
 *
 * V3 adds the **View** control, and that rule is unchanged: the click mounts
 * {@link DocumentViewer}, and the mount is the only thing that fetches. There
 * is no `onMouseEnter`, no warm-up, and no pre-mounted viewer held closed —
 * `active` is `null` until a person presses a button.
 *
 * ⚠️ **`originalName` is attacker-controlled free text** off an upload. It is
 * rendered with `wrap-anywhere` and is never turned into anything but text.
 *
 * ⚠️ **Size and type are shown before any fetch**, so opening a 20 MB scan is a
 * decision rather than a surprise.
 */

function iconFor(mimeType: string) {
  if (VERIFICATION_VIEWABLE_IMAGE_TYPES.includes(mimeType)) return Image
  if (mimeType === VERIFICATION_VIEWABLE_PDF_TYPE) return FileText
  return FileWarning
}

export function DocumentList({ record }: { record: Verification }) {
  const documents = record.documents ?? []
  /*
   * The open document, or nothing. Mounting the viewer is what fetches, so this
   * being `null` on first render is the no-prefetch guarantee — not a
   * convenience.
   */
  const [active, setActive] = useState<VerificationDocument | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <CardDescription>
          {/*
           * ⚠️ Stated permanently, where the decision is made — not in a
           * tooltip and not as a warning. It is a fact, and an operator who
           * knows it behaves differently from one who finds out afterwards.
           */}
          Opening a document is recorded against your name and IP address.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {documents.length === 0 ? (
          /*
           * ⚠️ A real, common state rather than an edge case: all three pending
           * business applications on the live service carry no documents at all
           * (§3.5). Said plainly, because it is the single fact that decides
           * whether this application can be reviewed.
           */
          <p className="flex items-start gap-2 rounded-md border border-warning-soft bg-warning-soft px-3 py-2 text-body text-warning-foreground">
            <FileWarning className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              No documents were submitted with this application. There is nothing to
              review.
            </span>
          </p>
        ) : (
          <ul className="space-y-2">
            {documents.map((document) => {
              const Icon = iconFor(document.mimeType)

              return (
                <li
                  key={document.docIndex}
                  className="flex flex-col gap-2 rounded-md border border-border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <span className="flex min-w-0 items-start gap-2.5">
                    <Icon
                      className="mt-0.5 size-4 shrink-0 text-foreground-muted"
                      aria-hidden="true"
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-body wrap-anywhere">
                        {document.originalName}
                      </span>
                      <span className="text-caption text-foreground-muted">
                        {formatBytes(document.sizeBytes)} · {document.mimeType} ·
                        uploaded <DateTime value={document.uploadedAt} relative />
                      </span>
                    </span>
                  </span>

                  {/*
                   * ⚠️ A button, never a link. A link has a URL, and a URL to a
                   * decrypted identity document is the one thing this module
                   * exists to not create — it would be copyable, shareable and
                   * openable in a new tab outside the panel's lifecycle.
                   *
                   * There is deliberately NO download affordance, in this phase
                   * or any later one — it would write an unencrypted national ID
                   * to the operator's disk, outside every guarantee the vault
                   * makes (§1.2).
                   */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 self-start sm:self-auto"
                    onClick={() => setActive(document)}
                  >
                    <Eye className="size-3.5 shrink-0" aria-hidden="true" />
                    {/*
                     * Named, because a row can hold several documents and
                     * "View" alone is ambiguous to a screen reader moving
                     * through them. `sr-only` so the visible control stays a
                     * single word.
                     */}
                    View
                    <span className="sr-only"> {document.originalName}</span>
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      {/*
       * ⚠️ Mounted only when there is something to show, and unmounted on close
       * — not held open={false} in the tree. That is what makes
       * "revoked on close" and "revoked on unmount" the same code path, and it
       * is why nothing fetches until a person presses View.
       *
       * Keyed on `docIndex` so choosing a different document remounts rather
       * than reusing the instance: a reused one would have to revoke the old URL
       * and fetch again inside the same lifecycle, which is the arrangement
       * blob leaks come from.
       */}
      {active ? (
        <DocumentViewer
          key={active.docIndex}
          verificationId={record.id}
          document={active}
          onClose={() => setActive(null)}
        />
      ) : null}
    </Card>
  )
}
