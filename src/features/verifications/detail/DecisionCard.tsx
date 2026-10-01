import { Check, ShieldAlert, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { isAppError } from '@/api/errors'
import { ConfirmActionDialog } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatDate } from '@/lib/datetime'
import {
  VERIFICATION_REJECTION_CODE_VALUES,
  type Verification,
  type VerificationDecisionPayload,
  type VerificationRejectionCode,
} from '@/types/verification'

import { describeRejectionCode } from '../labels'
import { resolveSubject, SUBJECT_UNKNOWN_LABEL } from '../subject'
import { useVerificationDecisionMutation } from '../useVerifications'

/**
 * Approve or reject — the write (plan.md §5.5, phase V4).
 *
 * ⚠️ **Three facts shape every line of this file, and all three were found by
 * calling the live API rather than by reading the doc.**
 *
 * 1. **A decision is not terminal.** `APPROVED` is documented *"Terminal state
 *    (Immutable)"* and is nothing of the kind: a `REJECT` against an approved
 *    application returns 200 and rejects it (§3.1). So the controls stay
 *    available after a decision, and **both dialogs name the decision they are
 *    about to overwrite**, with its date. That sentence exists because the doc
 *    said it could not happen — and because two probes trusting the doc rejected
 *    a real applicant's approved record on 2026-09-29.
 * 2. **The server accepts a rejection with no reason.** `REJECT` with only a
 *    code, only a sentence, or neither, all return 200 (§3.6), and the applicant
 *    is refused and handed nothing to act on. The panel refuses to create one
 *    from both ends: the code is a required key on
 *    `RejectVerificationPayload`, so omitting it is a compile error, and the
 *    sentence is the dialog's mandatory reason.
 * 3. **An application can have nothing to review.** Every pending business
 *    application on the live service has `documentCount: 0` (§3.5), so approving
 *    on no evidence is the common path here rather than an edge case. It
 *    escalates to `critical`.
 *
 * ⚠️ **`rejectionReason` and `adminNotes` are one careless paste apart.** The
 * applicant reads the first and never sees the second, so they are never
 * adjacent and unlabelled: the reason carries the dialog's `Reason` label with a
 * hint saying the applicant reads it, and the note says the opposite in its own.
 */

/** Which dialog is open, if any. */
type Pending = 'APPROVE' | 'REJECT' | null

export function DecisionCard({ record }: { record: Verification }) {
  const [pending, setPending] = useState<Pending>(null)
  const [rejectionCode, setRejectionCode] = useState<VerificationRejectionCode | ''>('')
  const [adminNotes, setAdminNotes] = useState('')

  const mutation = useVerificationDecisionMutation(record.id)

  const subject = resolveSubject(record)
  const subjectName = subject.name ?? SUBJECT_UNKNOWN_LABEL
  const documentCount = record.documents?.length ?? record.documentCount ?? 0
  const hasNoDocuments = documentCount === 0

  /*
   * ⚠️ Read from `reviewedAt` **or** the status, never the status alone. A record
   * can carry a decision with no timestamp, and either signal means a colleague
   * has already been here.
   */
  const isDecided = Boolean(record.reviewedAt) || record.status !== 'PENDING'
  const decidedOn = record.reviewedAt ? formatDate(record.reviewedAt) : null

  function close() {
    setPending(null)
    setRejectionCode('')
    setAdminNotes('')
    mutation.reset()
  }

  /**
   * The sentence naming what is about to be overwritten (§3.1).
   *
   * Prepended to both dialogs' effect copy whenever a decision already exists,
   * because the operator may be undoing a colleague's work — or their own from
   * last week — and the API will let them do it without a murmur.
   */
  function existingDecisionClause(verb: 'Approving' | 'Rejecting'): string {
    if (!isDecided) return ''

    const state =
      record.status === 'APPROVED'
        ? 'approved'
        : record.status === 'REJECTED'
          ? 'rejected'
          : record.status === 'REVOKED'
            ? 'revoked'
            : 'already decided'

    return `This application was ${state}${decidedOn ? ` on ${decidedOn}` : ''}. ${verb} it now overwrites that decision. `
  }

  /** One mutation call for both outcomes, so success and failure read alike. */
  function decide(payload: VerificationDecisionPayload, success: string) {
    mutation.mutate(payload, {
      onSuccess: () => {
        toast.success(success)
        close()
      },
      onError: (error) => {
        /*
         * Left open on failure, deliberately — the operator's typed reason is
         * still in the dialog, and a rejection sentence they wrote for a real
         * person is not something to discard because a request timed out.
         */
        toast.error(
          isAppError(error) ? error.message : 'The decision could not be recorded.',
        )
      },
    })
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{isDecided ? 'Change this decision' : 'Decision'}</CardTitle>
          <CardDescription>
            {isDecided ? (
              /*
               * ⚠️ Stated plainly rather than left to the dialogs. The doc calls
               * approval terminal; it is not (§3.1), and an operator who believes
               * it will not expect these buttons to do anything.
               */
              <>
                This application has already been decided. Deciding again overwrites it
                — including withdrawing a verification that was granted.
              </>
            ) : hasNoDocuments ? (
              /*
               * ⚠️ Deliberately NOT a second copy of the documents card's
               * sentence. That card already says no documents were submitted and
               * that there is nothing to review; repeating it here read as a
               * stutter on screen and made `getByText` ambiguous in V2's own
               * test — which is how the duplication was caught. This line adds
               * what the other one cannot: what to do about it.
               */
              <>
                This application carries no evidence to weigh. Rejecting is the ordinary
                outcome here.
              </>
            ) : (
              /*
               * ⚠️ The V5 copy pass added the first sentence. plan.md §1 names
               * three properties this module must keep in view, and the third —
               * *"the applicant is a person who is waiting"* — was the one the
               * shipped copy never said out loud. It was missing from the single
               * place it matters most: the moment somebody decides. Everything
               * else here is addressed to the operator's own risk.
               */
              <>
                Somebody is waiting on this. Open every document before deciding — both
                outcomes are recorded against your name.
              </>
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            variant={isDecided ? 'outline' : 'primary'}
            onClick={() => setPending('APPROVE')}
          >
            <Check className="size-4" aria-hidden="true" />
            {record.status === 'APPROVED' ? 'Approve again' : 'Approve'}
          </Button>
          <Button variant="outline" onClick={() => setPending('REJECT')}>
            <X className="size-4" aria-hidden="true" />
            {record.status === 'REJECTED' ? 'Reject again' : 'Reject'}
          </Button>

          {hasNoDocuments ? (
            <p className="flex items-start gap-2 text-caption text-warning-foreground sm:ml-auto sm:max-w-[16rem]">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Approving this grants verification on no evidence.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------------- *
       * Approve — no reason field.
       *
       * ⚠️ Removed on request, 2026-10-01, and it is a real loosening worth
       * naming. V4 routed the dialog's mandatory reason into `adminNotes`, the
       * only text field the approve payload has, so an approval carried a typed
       * justification. It no longer does: approving is now two clicks and
       * records nothing about why.
       *
       * That matters most on the case this dialog was escalated for — every
       * pending business application on the live service has zero documents
       * (§3.5), so the common approval grants verified status on no evidence AND
       * no stated reason. The `critical` severity and the copy naming the
       * absence are what remain of the mitigation.
       *
       * `reason="none"` is documented for endpoints with nowhere to put the
       * text. That is not the case here — `adminNotes` exists and the server
       * accepts it — so this is a product decision, not a contract one.
       * ---------------------------------------------------------------- */}
      <ConfirmActionDialog
        open={pending === 'APPROVE'}
        onOpenChange={(next) => {
          if (!next) close()
        }}
        title="Approve this application"
        target={`${subjectName} (${record.id})`}
        /*
         * ⚠️ `critical` with nothing to review, because that grants verified
         * status on no evidence at all (§3.5) — and `critical` when overwriting
         * an existing decision, because that is §3.1 in one click.
         */
        severity={hasNoDocuments || isDecided ? 'critical' : 'warning'}
        effect={
          existingDecisionClause('Approving') +
          (hasNoDocuments
            ? 'No documents were submitted, so this grants verified status on no evidence at all. '
            : '') +
          `${subjectName} will be marked verified and told so in the app.`
        }
        confirmLabel={record.status === 'APPROVED' ? 'Approve again' : 'Approve'}
        reason="none"
        loading={mutation.isPending}
        onConfirm={() => {
          /*
           * No `adminNotes`. Sending `""` would overwrite any note already on
           * the record with an empty string — the approve payload's only text
           * field, blanked by an action that no longer collects text. Omitting
           * the key leaves whatever is there alone.
           */
          decide({ action: 'APPROVE' }, `${subjectName} is now verified.`)
        }}
      />

      {/* ---------------------------------------------------------------- *
       * Reject — the reason is `rejectionReason`, which the applicant reads.
       * ---------------------------------------------------------------- */}
      <ConfirmActionDialog
        open={pending === 'REJECT'}
        onOpenChange={(next) => {
          if (!next) close()
        }}
        title="Reject this application"
        target={`${subjectName} (${record.id})`}
        severity="critical"
        effect={
          existingDecisionClause('Rejecting') +
          `${subjectName} will be told their verification was refused, and shown the reason you write below.`
        }
        confirmLabel={record.status === 'REJECTED' ? 'Reject again' : 'Reject'}
        /*
         * ⚠️ Blocked until a code is chosen — the client-side half of refusing to
         * create the reasonless rejection the server accepts (§3.6). The other
         * half is the required key on `RejectVerificationPayload`.
         */
        confirmDisabled={!rejectionCode}
        fields={
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="verification-rejection-code">
                Reason code <span className="text-danger">*</span>
              </Label>
              <Select
                value={rejectionCode}
                onValueChange={(value) =>
                  setRejectionCode(value as VerificationRejectionCode)
                }
              >
                <SelectTrigger id="verification-rejection-code" className="w-full">
                  <SelectValue placeholder="Choose what was wrong with it" />
                </SelectTrigger>
                <SelectContent>
                  {VERIFICATION_REJECTION_CODE_VALUES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {describeRejectionCode(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-caption text-foreground-muted">
                {/* Not an internal category: it drives the applicant's own app. */}
                This drives what the applicant&rsquo;s app shows them.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="verification-admin-notes">
                {/*
                 * ⚠️ Labelled internal wherever it appears, because the field
                 * above it is not, and telling the applicant the wrong one cannot
                 * be taken back.
                 */}
                Internal note — the applicant never sees this{' '}
                <span className="text-foreground-subtle">(optional)</span>
              </Label>
              <Textarea
                id="verification-admin-notes"
                value={adminNotes}
                onChange={(event) => setAdminNotes(event.target.value)}
                rows={2}
                placeholder="Context for whoever reads this record next."
              />
            </div>
          </div>
        }
        reasonHint={
          <>
            <span className="font-medium">The applicant reads this.</span> Write it to
            them — say what was wrong and what to send instead.
          </>
        }
        loading={mutation.isPending}
        onConfirm={(reason) => {
          /*
           * Guarded although the type requires it: `rejectionCode` is `''` until
           * the operator picks one, and `confirmDisabled` is the only thing
           * standing between that and a rejection the server would accept with no
           * code at all.
           */
          if (!rejectionCode) return

          decide(
            {
              action: 'REJECT',
              rejectionCode,
              rejectionReason: reason,
              ...(adminNotes.trim() ? { adminNotes: adminNotes.trim() } : {}),
            },
            `${subjectName} was rejected, and told why.`,
          )
        }}
      />
    </>
  )
}
