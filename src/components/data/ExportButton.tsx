import { Download } from 'lucide-react'
import { useState } from 'react'

import { ConfirmActionDialog } from '@/components/feedback/ConfirmActionDialog'
import { Button } from '@/components/ui/button'
import { formatCount } from '@/lib/format'

export interface ExportButtonProps {
  /**
   * Whether the acting admin holds `export_data`. When false the control is
   * not rendered at all — but the backend still enforces the permission
   * (plan.md §3.4).
   */
  canExport: boolean
  /** Rows the current filter set would produce. */
  rowCount: number
  /** Human-readable description of the current filters, shown before confirming. */
  scopeDescription: string
  /** Resource being exported, e.g. "users". */
  resource: string
  loading?: boolean
  /** Receives the mandatory reason — exports are audited events. */
  onExport: (reason: string) => void
  className?: string
}

/**
 * Permission-gated export trigger.
 *
 * plan.md §Analytics: an export is a sensitive action. It requires permission,
 * confirms its scope and row count, records a reason, and produces an audit
 * event. Fields the requester cannot view are excluded server-side.
 */
export function ExportButton({
  canExport,
  rowCount,
  scopeDescription,
  resource,
  loading = false,
  onExport,
  className,
}: ExportButtonProps) {
  const [open, setOpen] = useState(false)

  if (!canExport) return null

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={rowCount === 0}
        className={className}
      >
        <Download /> Export CSV
      </Button>

      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        severity="info"
        title={`Export ${resource}`}
        target={`${formatCount(rowCount)} ${resource} matching the current filters`}
        /*
         * Deliberately does NOT promise that fields the role cannot view are
         * excluded — that is the backend's decision and it has not been
         * verified per role. The users export currently contains unmasked
         * phone numbers and email addresses, so the copy warns instead of
         * reassuring.
         */
        effect="A file is generated from the current filters and downloaded to this device. It may contain unmasked personal data. This export is recorded in the audit log."
        confirmLabel="Generate export"
        loading={loading}
        onConfirm={(reason) => {
          onExport(reason)
          setOpen(false)
        }}
        details={
          <div className="rounded-md border border-border bg-surface-muted px-3 py-2.5">
            <span className="block text-overline text-foreground-subtle uppercase">
              Applied filters
            </span>
            <span className="mt-0.5 block text-body">{scopeDescription}</span>
          </div>
        }
      />
    </>
  )
}
