import { AlertTriangle, ExternalLink, Image as ImageIcon, Receipt } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { safeHttpsUrl } from '@/lib/safeUrl'

/**
 * The payer's receipt (plan.md §5, phase W3).
 *
 * ⚠️ **This is the evidence a payment decision rests on, which is exactly why
 * it is the most dangerous thing on the screen.** An operator approving a
 * top-up is being asked to look at an image a stranger uploaded in order to
 * release real diamonds. That combination — a link the reviewer *must* open,
 * attached to money — is the one an attacker would aim at. `safeHttpsUrl`
 * refuses anything that is not `https:`, and the live backend has been
 * observed storing and serving `javascript:` verbatim on three other routes.
 *
 * ⚠️ **Nothing is fetched until the operator asks.** The image is not mounted
 * with the drawer. Two reasons, and the second is the stronger: a request to a
 * stranger's host fires from an admin session merely by opening a row, and
 * `receiptImageUrl` points at a CDN that can log who looked and when. An
 * operator should decide to look.
 *
 * ⚠️ **A refused URL is shown, not hidden.** "They submitted something the
 * panel will not open" is part of what is being judged, and the raw value is
 * the evidence. Dropping the row would take it away from the only person able
 * to act on it — and an operator who sees nothing may well approve the payment.
 */
export function ReceiptField({ url }: { url: string | null | undefined }) {
  const [open, setOpen] = useState(false)

  if (!url?.trim()) {
    return (
      <p className="flex items-center gap-2 text-body text-foreground-muted">
        <Receipt className="size-4 shrink-0" aria-hidden="true" />
        No receipt was attached.
      </p>
    )
  }

  const src = safeHttpsUrl(url)

  if (!src) {
    return (
      <div className="space-y-1.5">
        <p className="flex items-start gap-2 text-body text-danger-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            This receipt cannot be opened. It is not an <code>https</code> link, so the
            panel will not load it — treat the payment as unevidenced.
          </span>
        </p>
        {/*
         * Inert text in a bordered box: no anchor, no `src`, and
         * `wrap-anywhere` so a long hostile string cannot widen the drawer.
         */}
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 font-mono text-caption wrap-anywhere">
          {url}
        </p>
      </div>
    )
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-muted px-3 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-body">
          <ImageIcon
            className="size-4 shrink-0 text-foreground-muted"
            aria-hidden="true"
          />
          <span className="truncate">Receipt image</span>
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          aria-label="View the receipt attached to this payment"
        >
          View
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {/*
       * ⚠️ `referrerPolicy="no-referrer"` — without it the request carries
       * this panel's URL, which tells whoever hosts the image that an admin
       * at a named deployment opened their receipt, and on which row.
       */}
      <img
        src={src}
        alt="Receipt submitted with this payment"
        referrerPolicy="no-referrer"
        className="max-h-80 w-full rounded-md border border-border bg-surface-muted object-contain"
      />
      <a
        href={src}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1.5 text-caption text-primary hover:underline"
      >
        <ExternalLink className="size-3.5" aria-hidden="true" />
        Open full size in a new tab
      </a>
    </div>
  )
}
