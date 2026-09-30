import { AlertTriangle } from 'lucide-react'

import { DateTime } from '@/components/display'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { Verification } from '@/types/verification'

import { describeRejectionCode } from '../labels'

/**
 * What was already decided, and what the applicant was told (plan.md §3.6).
 *
 * Read-only in V2 — the Approve and Reject controls arrive in V4. This card is
 * the record of a decision, not the making of one.
 *
 * ⚠️ **Its real job is naming what is missing.** The API accepts a `REJECT`
 * with no `rejectionCode`, with no `rejectionReason`, or with neither — all
 * three return 200 (§3.6). So a rejected application can carry no explanation
 * at all, and the applicant is told they were refused with nothing to act on.
 *
 * An operator answering *"why was I rejected?"* has to be able to see that the
 * answer was never stored. Rendering an empty paragraph would let them assume
 * the panel failed to load it and go looking for a bug instead of telling the
 * applicant the truth.
 */
export function DecisionRecordCard({ record }: { record: Verification }) {
  const isDecided = Boolean(record.reviewedAt) || record.status !== 'PENDING'
  const isRejected = record.status === 'REJECTED' || record.status === 'REVOKED'

  /* Nothing has happened yet — V4's controls will live here instead. */
  if (!isDecided) return null

  const codeLabel = describeRejectionCode(record.rejectionCode)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Decision</CardTitle>
        <CardDescription>
          {record.reviewedAt ? (
            <>
              Recorded <DateTime value={record.reviewedAt} relative />.
            </>
          ) : (
            'No decision timestamp was recorded.'
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isRejected ? (
          <div className="space-y-3">
            <div className="space-y-0.5">
              <p className="text-caption text-foreground-muted">
                Reason code — shown to the applicant in their app
              </p>
              {codeLabel ? (
                <p className="text-body">{codeLabel}</p>
              ) : (
                <p className="flex items-start gap-2 text-body text-warning-foreground">
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  No reason code was recorded.
                </p>
              )}
            </div>

            <div className="space-y-0.5">
              <p className="text-caption text-foreground-muted">
                Explanation — what the applicant reads
              </p>
              {record.rejectionReason ? (
                <p className="text-body wrap-anywhere">{record.rejectionReason}</p>
              ) : (
                /*
                 * ⚠️ The §3.6 mitigation. This is not an error state — the
                 * write succeeded and the service stored nothing. The sentence
                 * has to say that, or an operator reads a blank as a failure to
                 * load.
                 */
                <p className="flex items-start gap-2 text-body text-warning-foreground">
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  No explanation was recorded. The applicant was told they were rejected
                  and given nothing to act on.
                </p>
              )}
            </div>
          </div>
        ) : null}

        <div className="space-y-0.5">
          <p className="text-caption text-foreground-muted">
            {/*
             * Labelled as internal every time it appears, because the field
             * beside it is not, and the two are one careless paste apart.
             */}
            Internal note — the applicant never sees this
          </p>
          {record.adminNotes ? (
            <p className="text-body wrap-anywhere">{record.adminNotes}</p>
          ) : (
            <p className="text-body text-foreground-subtle">None.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
