import { Building2, UserRound } from 'lucide-react'

import { CopyableId } from '@/components/display'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Verification } from '@/types/verification'

import { describeIdType, initialsFor } from '../labels'
import { resolveSubject, SUBJECT_UNKNOWN_LABEL } from '../subject'

/**
 * Who filed the application, and what they say they are (plan.md §5.3).
 *
 * ⚠️ **Two entirely different records answer that question**, and which one is
 * populated is decided by `targetType`. On a `BUSINESS_ENTITY` application every
 * `applicant` field is null and the company block carries eleven fields; on a
 * `USER_IDENTITY` application the reverse. Rendering both unconditionally would
 * give every application a half-empty card.
 *
 * ⚠️ **`avatarUrl` is never loaded.** It is a storage key with no origin, so an
 * `<img>` would 404 on every application — initials instead (`initialsFor`).
 *
 * ⚠️ **`website` is never a link.** It is free text the applicant typed, and
 * this module's threat model is the same one `safeAttachmentHref` exists for in
 * feedback: an unvalidated string turned into an `href` is a `javascript:` URL
 * one paste away. It is rendered as text.
 */

/** One label/value row. Values are attacker-controlled, so they wrap, never truncate to nothing. */
function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null

  return (
    <div className="space-y-0.5">
      <dt className="text-caption text-foreground-muted">{label}</dt>
      <dd className="text-body wrap-anywhere">{value}</dd>
    </div>
  )
}

function Avatar({ name }: { name: string | null }) {
  return (
    <span
      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-body-strong text-primary-700"
      aria-hidden="true"
    >
      {initialsFor(name)}
    </span>
  )
}

export function ApplicantCard({ record }: { record: Verification }) {
  const subject = resolveSubject(record)
  const isBusiness = record.targetType === 'BUSINESS_ENTITY'
  const business = record.business
  const applicant = record.applicant

  const Icon = isBusiness ? Building2 : UserRound

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 shrink-0 text-foreground-muted" aria-hidden="true" />
          {isBusiness ? 'Business' : 'Applicant'}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={subject.name} />
          <span className="flex min-w-0 flex-col">
            {subject.name ? (
              <span className="text-body-strong wrap-anywhere">{subject.name}</span>
            ) : (
              /*
               * ⚠️ Named, not blank. Three live business applications return an
               * applicant object whose every field is null, and an empty header
               * here reads as a rendering fault rather than as missing data
               * (§3.4).
               */
              <span className="text-body-strong text-foreground-subtle italic">
                {SUBJECT_UNKNOWN_LABEL}
              </span>
            )}
            {subject.secondary ? (
              <span className="text-caption wrap-anywhere text-foreground-muted">
                {subject.secondary}
              </span>
            ) : null}
          </span>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2">
          {isBusiness ? (
            <>
              <Field label="Category" value={business?.category} />
              <Field label="Address" value={business?.address} />
              <Field label="Website" value={business?.website} />
              <Field label="Operating hours" value={business?.operatingHours} />
              <div className="sm:col-span-2">
                <Field label="Description" value={business?.description} />
              </div>
            </>
          ) : (
            <>
              <Field label="Document type" value={describeIdType(record.idType)} />
              <Field label="Username" value={applicant?.username} />
              <Field label="Email" value={applicant?.email} />
              <Field label="Phone" value={applicant?.phone} />
            </>
          )}
        </dl>

        {/*
         * ⚠️ The owning account, and on a business application it is the ONLY
         * route from this record back to a person — `applicant` is empty, so
         * without this id nobody can say who filed it (§3.4).
         *
         * Rendered as a copyable id rather than a link to `/users/:id`: that
         * route is guarded by `users.view`, which a compliance officer holding
         * only `verifications.review` does not have, and a link that 403s is
         * worse than an id they can paste to someone who can open it.
         */}
        {/*
         * ⚠️ Each id carries a **visible** caption. `CopyableId`'s own `label`
         * is `sr-only`, so the first cut rendered two bare truncated ids side by
         * side — `cmu044g9…meewcjq  cmu044h6…u36ov0j` — with nothing to say
         * which was the person and which the company. A sighted operator pasting
         * one to a colleague had no way to know what they were sending. The
         * screen-reader label is kept as well, so the copy button is still
         * announced as "Copy Owner account" rather than "Copy identifier".
         */}
        <dl className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
          {isBusiness && business?.userId ? (
            <div className="space-y-0.5">
              <dt className="text-caption text-foreground-muted">Owner account</dt>
              <dd>
                <CopyableId
                  value={business.userId}
                  label="Owner account"
                  maxLength={16}
                />
              </dd>
            </div>
          ) : null}
          {!isBusiness && record.userId ? (
            <div className="space-y-0.5">
              <dt className="text-caption text-foreground-muted">Account</dt>
              <dd>
                <CopyableId value={record.userId} label="Account" maxLength={16} />
              </dd>
            </div>
          ) : null}
          {business?.id ? (
            <div className="space-y-0.5">
              <dt className="text-caption text-foreground-muted">Business</dt>
              <dd>
                <CopyableId value={business.id} label="Business" maxLength={16} />
              </dd>
            </div>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  )
}
