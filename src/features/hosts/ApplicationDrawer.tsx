import { useState } from 'react'
import { toast } from 'sonner'

import { isAppError } from '@/api/errors'
import { repairNotFoundMessage } from '@/api/hosts'
import { DateTime } from '@/components/display'
import { ConfirmActionDialog } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { safeHttpsUrl } from '@/lib/safeUrl'

import { StatusCell } from './cells'
import { applicantName } from './names'
import { IntroMediaField } from './IntroMediaField'
import { useHostApplicationQuery, useReviewHostApplicationMutation } from './useHosts'

/**
 * The applicant detail drawer and its two decisions (plan.md §4.4, phase H5).
 *
 * ⚠️ **Approve is irreversible from this panel.** It creates or activates the
 * applicant's `LiveHostProfile`, emits `host:application_reviewed` over
 * Socket.io, and fires an in-app plus FCM push notification. No un-approve
 * endpoint exists — the nearest remedy is suspending the host afterwards,
 * which is a different record and a separate, visible act. So it goes through
 * `ConfirmActionDialog`, not a bare button.
 *
 * ⚠️ **A rejection reason is read by the applicant**, not by an auditor. The
 * dialog's default hint promises the text is "recorded in the audit log with
 * your name" — true for the consumer-user actions it was built for, and the
 * wrong promise here. `reasonHint` says where it actually goes.
 */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-overline text-foreground-muted">{label}</p>
      <div className="text-body wrap-anywhere">{children}</div>
    </div>
  )
}

/**
 * One titled block of the drawer.
 *
 * ⚠️ **Added in H7, because a flat stack of eight labelled values was the
 * problem.** The drawer read as one undifferentiated column: the facts an
 * operator decides on (category, commitment) sat in the same visual weight as
 * the prose they skim and the attachments they may never open, and the whole
 * thing ended in a ragged tail of white space. Grouping says which parts are
 * the same kind of thing without adding a word of chrome.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <h3 className="text-overline text-foreground-muted">{title}</h3>
      {children}
    </section>
  )
}

/**
 * A short fact, stated as a label/value pair.
 *
 * ⚠️ Two columns only from `sm` up. At 360px a 9rem label gutter would leave
 * roughly 140px for the value, and `TALK · 5 hrs/week` would wrap mid-phrase on
 * the one screen where vertical space is already scarcest.
 */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-caption text-foreground-muted">{label}</dt>
      <dd className="text-body wrap-anywhere">{children}</dd>
    </div>
  )
}

/**
 * The applicant's onboarding answers (O4, resolved 2026-10-15).
 *
 * ⚠️ **Nothing fixes the question set**, so the keys are whatever the mobile
 * form asked on the day and the values are `unknown`. A string renders as
 * itself; anything else is stringified rather than dropped, because an answer
 * an operator cannot see is worse than one that reads as `true`.
 */
function QaResponses({ answers }: { answers: Record<string, unknown> }) {
  const entries = Object.entries(answers)

  if (entries.length === 0) {
    return <span className="text-body text-foreground-muted">No answers recorded.</span>
  }

  return (
    <dl className="space-y-3">
      {entries.map(([question, answer]) => (
        <Fact key={question} label={humanizeKey(question)}>
          {typeof answer === 'string' && answer.trim()
            ? answer
            : answer === null || answer === undefined
              ? '—'
              : JSON.stringify(answer)}
        </Fact>
      ))}
    </dl>
  )
}

/** `yearsExperience` / `years_experience` → `Years experience`. */
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase() : key
}

export interface ApplicationDrawerProps {
  applicationId: string | null
  onClose: () => void
}

export function ApplicationDrawer({ applicationId, onClose }: ApplicationDrawerProps) {
  const query = useHostApplicationQuery(applicationId)
  const review = useReviewHostApplicationMutation()

  const [confirming, setConfirming] = useState<'APPROVE' | 'REJECT' | null>(null)

  const record = query.data
  const name = record ? applicantName(record) : ''
  const pending = (record?.status ?? '').toUpperCase() === 'PENDING'

  function submit(action: 'APPROVE' | 'REJECT', reason: string) {
    if (!applicationId) return

    review.mutate(
      {
        id: applicationId,
        payload:
          action === 'APPROVE'
            ? { action: 'APPROVE' }
            : { action: 'REJECT', rejectionReason: reason },
      },
      {
        onSuccess: () => {
          setConfirming(null)
          toast.success(
            action === 'APPROVE'
              ? `${name} can now go live.`
              : `${name}'s application was rejected.`,
          )
          onClose()
        },
        onError: (error) => {
          /*
           * ⚠️ The dialog stays open on failure. Closing it would lose the
           * reason the operator typed, and on a rejection that text is the
           * message the applicant receives — not something to make them write
           * twice because the first attempt 500'd.
           */
          toast.error(
            isAppError(error)
              ? repairNotFoundMessage(error.message)
              : 'The review could not be submitted.',
          )
        },
      },
    )
  }

  return (
    <>
      <Sheet open={Boolean(applicationId)} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 sm:max-w-xl"
          aria-label="Host application"
        >
          <SheetHeader>
            <SheetTitle className="wrap-anywhere">
              {query.isPending ? 'Loading application…' : name}
            </SheetTitle>
            <SheetDescription>
              {record?.user?.email ?? 'No email on this account.'}
            </SheetDescription>
          </SheetHeader>

          {/*
           * ⚠️ `-my-1.5 px-4 py-1.5 scroll-p-2` on the scroll body.
           *
           * `overflow-y: auto` promotes `overflow-x` to `auto` per spec, so
           * this box clips on BOTH axes — and the global `:focus-visible` draws
           * its ring 4px outside the element. Without the clearance, a focused
           * control flush against this edge loses its ring, which is only
           * visible to a geometry assertion. Two dialogs shipped that defect
           * before it was found.
           *
           * ⚠️ **The clearance was `-m-1.5 p-1.5` until H7, and that was wrong
           * horizontally.** `SheetContent` carries no padding of its own — the
           * header and footer each bring their own `p-4` — so a negative margin
           * there cancelled against nothing: the body's content box came out at
           * a **zero** inset, 16px left of the title above it, with the
           * motivation running flush into the window edge, and the box itself
           * hanging 6px past the sheet on each side. The pattern was copied
           * from `ConfirmActionDialog`, where the parent *is* padded and the
           * negative margin reclaims it.
           *
           * So the clearance is vertical only. `px-4` aligns the body with the
           * header and footer and gives a ring far more than the 4px it needs;
           * `-my-1.5` keeps the 6px top and bottom without adding height.
           * jsdom cannot see any of this — it was found by a browser geometry
           * assertion and a screenshot (`tests/e2e/hosts.spec.ts`).
           */}
          <div className="-my-1.5 min-h-0 flex-1 scroll-p-2 space-y-5 overflow-y-auto px-4 py-1.5">
            {query.isPending ? (
              <div className="space-y-4" role="status" aria-label="Loading application">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : query.isError || !record ? (
              <p className="text-body text-danger-foreground">
                {isAppError(query.error)
                  ? repairNotFoundMessage(query.error.message)
                  : 'This application could not be loaded.'}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusCell record={record} />
                  {record.createdAt ? (
                    <span className="text-caption text-foreground-muted">
                      Submitted <DateTime value={record.createdAt} relative />
                    </span>
                  ) : null}
                </div>

                <Section title="Application">
                  <dl className="space-y-3">
                    <Fact label="Category">{record.niche || '—'}</Fact>
                    <Fact label="Commitment">
                      {typeof record.expectedHostingHoursPerWeek === 'number'
                        ? `${record.expectedHostingHoursPerWeek} hrs/week`
                        : 'Not stated'}
                    </Fact>
                  </dl>

                  {record.bio ? <Field label="Bio">{record.bio}</Field> : null}

                  {record.motivation ? (
                    <Field label="Motivation">{record.motivation}</Field>
                  ) : null}
                </Section>

                {record.qaResponses && Object.keys(record.qaResponses).length > 0 ? (
                  <Section title="Questionnaire">
                    <QaResponses answers={record.qaResponses} />
                  </Section>
                ) : null}

                <Section title="What they submitted">
                  <Field label="Intro sample">
                    <IntroMediaField url={record.introMediaUrl} />
                  </Field>

                  <Field label="Social links">
                    <SocialLinks links={record.socialLinks} />
                  </Field>
                </Section>

                {record.rejectionReason ? (
                  /*
                   * ⚠️ Tinted, and last. This is the only block an applicant
                   * has already been shown, so an operator reopening a rejected
                   * application should be able to find the words that were sent
                   * without reading the rest again.
                   */
                  <section className="space-y-1 rounded-lg border border-danger/30 bg-danger/5 p-4">
                    <h3 className="text-overline text-foreground-muted">
                      Rejection reason sent to the applicant
                    </h3>
                    <p className="text-body wrap-anywhere">{record.rejectionReason}</p>
                  </section>
                ) : null}
              </>
            )}
          </div>

          {record && pending ? (
            /*
             * ⚠️ `px-4 py-4` — the footer is a direct child of `SheetContent`,
             * which carries no padding of its own, so until H7 the Approve and
             * Reject buttons sat 16px left of every word above them and flush
             * against the sheet's own edge. Same cause as the scroll body's
             * missing inset, found in the same screenshot.
             */
            <div className="flex flex-wrap gap-2 border-t border-border px-4 py-4">
              <Button onClick={() => setConfirming('APPROVE')}>Approve</Button>
              <Button variant="outline" onClick={() => setConfirming('REJECT')}>
                Reject
              </Button>
            </div>
          ) : record ? (
            /*
             * ⚠️ Stated rather than leaving the buttons off silently. An
             * operator who sees no controls cannot tell whether the decision
             * was already made or whether their role is too low.
             */
            <p className="border-t border-border px-4 py-4 text-caption text-foreground-muted">
              This application has already been reviewed, so it cannot be approved or
              rejected again.
            </p>
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmActionDialog
        open={confirming === 'APPROVE'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Approve this application"
        target={name}
        effect="This creates the applicant's live host profile immediately and notifies them by push. There is no way to un-approve from this panel — the only remedy afterwards is suspending them from the host roster."
        severity="critical"
        confirmLabel="Approve and notify"
        loading={review.isPending}
        /*
         * ⚠️ `reason: 'none'` because the API has nowhere to put one. The
         * approve body is `{ "action": "APPROVE" }` and nothing else — asking
         * for ten characters the client then discards would imply a record
         * that is never even sent.
         */
        reason="none"
        onConfirm={() => submit('APPROVE', '')}
      />

      <ConfirmActionDialog
        open={confirming === 'REJECT'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Reject this application"
        target={name}
        effect="The applicant is told their application was rejected, is shown the reason you write below, and can apply again."
        severity="warning"
        confirmLabel="Reject and notify"
        loading={review.isPending}
        /*
         * ⚠️ The dialog enforces 10 characters; the service requires 5. The
         * panel is deliberately the stricter of the two: this text is not an
         * audit note, it is a message a real person reads about their own
         * application, and "nope." clears the server's bar.
         */
        reasonHint="At least 10 characters. This is sent to the applicant as the reason their application was rejected — write it for them, not for the log."
        onConfirm={(reason) => submit('REJECT', reason)}
      />
    </>
  )
}

/**
 * ⚠️ Every link defused before it is rendered.
 *
 * `socialLinks` is free-form JSON written by the applicant and stored verbatim
 * — the hostile fixture carries `"personal": "not-a-url-at-all"` because that
 * is what the service accepts. A value that is not `https:` is shown as text so
 * the operator can still see what was claimed.
 */
function SocialLinks({ links }: { links: Record<string, string> | null | undefined }) {
  const entries = Object.entries(links ?? {})

  if (entries.length === 0) {
    return <span className="text-foreground-muted">None provided.</span>
  }

  return (
    <ul className="space-y-1">
      {entries.map(([platform, value]) => {
        const href = safeHttpsUrl(value)

        return (
          <li key={platform} className="flex flex-wrap items-baseline gap-2">
            <span className="text-caption text-foreground-muted">{platform}</span>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="wrap-anywhere text-primary hover:underline"
              >
                {href}
              </a>
            ) : (
              <span className="font-mono text-caption wrap-anywhere">
                {value}{' '}
                <span className="text-danger-foreground">(not a usable link)</span>
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
