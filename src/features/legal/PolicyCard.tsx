import { FilePlus2, FileText, History } from 'lucide-react'
import { Link } from 'react-router'

import { ROUTES } from '@/app/routes'
import { DateTime } from '@/components/display'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCopyToClipboard } from '@/lib/hooks/useCopyToClipboard'
import type { LegalDocument, LegalDocumentType } from '@/types/legal'

import { AdminName } from './cells'
import { isUpcoming, publicUrl, TYPE_DESCRIPTIONS, TYPE_LABELS } from './labels'

/**
 * One policy type on the overview (plan.md §3.1): what is live now, and what
 * is waiting. Read-only in LG1 — "New version" arrives with the editor (LG3).
 */

export interface PolicyCardProps {
  readonly type: LegalDocumentType
  readonly active: LegalDocument | undefined
  readonly drafts: readonly LegalDocument[]
  readonly loading: boolean
  readonly onShowHistory: () => void
  /** Shows "New version" and links drafts to the editor (`legal.edit`). */
  readonly canEdit: boolean
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-caption text-foreground-muted">{label}</dt>
      <dd className="min-w-0 text-right text-body">{children}</dd>
    </div>
  )
}

export function PolicyCard({
  type,
  active,
  drafts,
  loading,
  onShowHistory,
  canEdit,
}: PolicyCardProps) {
  const url = publicUrl(type)
  const { copy, copied } = useCopyToClipboard()
  const upcoming = active ? isUpcoming(active) : false
  const titleId = `policy-${type.toLowerCase()}`

  return (
    <Card className="flex w-full flex-col" aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId} className="flex flex-wrap items-center gap-2">
          <FileText className="size-4 text-foreground-muted" aria-hidden="true" />
          {TYPE_LABELS[type]}
          {active ? (
            <span className="rounded-sm bg-surface-muted px-1.5 py-0.5 font-mono text-caption text-foreground">
              v{active.version}
            </span>
          ) : null}
          {upcoming ? (
            <span className="rounded-sm bg-warning-soft px-1.5 py-0.5 text-overline text-warning-foreground uppercase">
              Upcoming
            </span>
          ) : null}
        </CardTitle>
        <CardDescription>{TYPE_DESCRIPTIONS[type]}</CardDescription>
      </CardHeader>

      <CardContent className="flex-1">
        {loading ? (
          <div className="space-y-2" aria-hidden="true">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : active ? (
          <dl className="space-y-2">
            <Row label={upcoming ? 'Takes effect' : 'In effect since'}>
              <DateTime value={active.effectiveDate} variant="date" />
            </Row>
            <Row label="Published">
              <DateTime value={active.publishedAt} variant="date" />
            </Row>
            <Row label="By">
              <AdminName id={active.publishedBy} />
            </Row>
            <Row label="Re-consent">
              {active.requiresReconsent ? 'Users must accept again' : 'Not required'}
            </Row>
          </dl>
        ) : (
          <p className="text-body text-foreground-muted">
            Not published yet. The apps and website have no version of this policy from
            the API.
          </p>
        )}

        {!loading && drafts.length > 0 ? (
          <p className="mt-3 rounded-md bg-surface-muted px-3 py-2 text-caption text-foreground-muted">
            {drafts.length === 1 && drafts[0] && canEdit ? (
              <Link
                to={ROUTES.legalEdit(drafts[0].id)}
                className="text-primary hover:underline"
              >
                Draft v{drafts[0].version} in progress
              </Link>
            ) : drafts.length === 1 ? (
              `Draft v${drafts[0]?.version ?? ''} in progress`
            ) : (
              `${drafts.length} drafts in progress`
            )}
          </p>
        ) : null}
      </CardContent>

      <CardFooter className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => void copy(url)}
          className="min-w-0 truncate text-left text-caption text-primary hover:underline"
          title={`Copy ${url}`}
        >
          {copied ? 'Link copied' : url.replace('https://', '')}
        </button>
        <span className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onShowHistory}>
            <History /> History
          </Button>
          {canEdit ? (
            <Button variant="outline" size="sm" asChild>
              <Link to={ROUTES.legalNew(type, active?.id)}>
                <FilePlus2 /> {active ? 'New version' : 'Write first version'}
              </Link>
            </Button>
          ) : null}
        </span>
      </CardFooter>
    </Card>
  )
}
