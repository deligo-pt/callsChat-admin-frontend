import { ChevronDown, Copy, FilePlus2, Pencil, Send } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { isAppError, NotFoundError } from '@/api/errors'
import { ROUTES } from '@/app/routes'
import { PERMISSIONS } from '@/auth/permissions'
import { useCan } from '@/auth/useAuth'
import { DateTime, KeyValueGrid, PageHeader, StatusBadge } from '@/components/display'
import { ErrorState, LoadingState, NotFoundState } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useCopyToClipboard } from '@/lib/hooks/useCopyToClipboard'
import type { LegalDocument } from '@/types/legal'

import { AdminName } from './cells'
import { diffVersions, previousVersion } from './compareVersions'
import { activeByType, isUpcoming, publicUrl, TYPE_LABELS } from './labels'
import { LegalPreview } from './LegalPreview'
import { PublishDialog } from './PublishDialog'
import { useLegalDocument, useLegalDocuments } from './useLegal'

/**
 * One version of a policy, read-only — `/legal/:legalId` (plan.md §3.3, LG5).
 *
 * Every status opens here. What the reader saw is drawn from the **server's**
 * `intro` and `sections`, not re-parsed, so this is the stored record — the
 * thing an audit would ask about. A draft offers Edit and Publish; a published
 * or archived version offers "New version from this".
 */

export function LegalDocumentPage() {
  const { legalId = '' } = useParams()
  const query = useLegalDocument(legalId)
  const all = useLegalDocuments()
  const canEdit = useCan(PERMISSIONS.legalEdit)
  const canPublish = useCan(PERMISSIONS.legalPublish)
  const [publishing, setPublishing] = useState(false)

  if (query.isPending) return <LoadingState variant="detail" />
  if (query.isError) {
    return query.error instanceof NotFoundError ? (
      <NotFoundState
        title="Version not found"
        description="No legal document has this id. A draft may have been deleted."
        action={
          <Button variant="outline" asChild>
            <Link to={ROUTES.legal}>Back to Legal & policies</Link>
          </Button>
        }
      />
    ) : (
      <ErrorState
        {...(isAppError(query.error) ? { description: query.error.message } : {})}
        {...(isAppError(query.error) && query.error.correlationId
          ? { correlationId: query.error.correlationId }
          : {})}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const doc = query.data
  const docs = all.data ?? []
  const label = TYPE_LABELS[doc.documentType]
  const active = activeByType(docs)[doc.documentType]
  const previous = previousVersion(doc, docs)

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Legal & policies', to: ROUTES.legal },
          {
            label: doc.status === 'DRAFT' ? 'Drafts' : 'History',
            to: ROUTES.legalFor({
              tab: doc.status === 'DRAFT' ? 'drafts' : 'history',
              type: doc.documentType,
            }),
          },
          { label: `v${doc.version}` },
        ]}
        title={`${label} v${doc.version}`}
        description={statusLine(doc)}
        actions={
          doc.status === 'DRAFT' ? (
            <>
              {canEdit ? (
                <Button variant="outline" asChild>
                  <Link to={ROUTES.legalEdit(doc.id)}>
                    <Pencil /> Edit draft
                  </Link>
                </Button>
              ) : null}
              {canPublish ? (
                <Button onClick={() => setPublishing(true)}>
                  <Send /> Publish…
                </Button>
              ) : null}
            </>
          ) : canEdit ? (
            <Button variant="outline" asChild>
              <Link to={ROUTES.legalNew(doc.documentType, doc.id)}>
                <FilePlus2 /> New version from this
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <LegalPreview
          className="order-2 xl:order-1"
          data={{
            title: doc.title,
            subtitle: doc.subtitle,
            effectiveDate: doc.effectiveDate,
            intro: doc.intro,
            sections: doc.sections,
            contact: doc.contact,
            consent: doc.consent,
            version: doc.version,
          }}
        />

        <div className="order-1 space-y-6 xl:order-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                Details <StatusBadge domain="legal" value={doc.status} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <KeyValueGrid
                columns={1}
                items={[
                  {
                    label: 'Effective',
                    value: (
                      <span>
                        <DateTime value={doc.effectiveDate} variant="date" />
                        {doc.status !== 'ARCHIVED' && isUpcoming(doc)
                          ? ' (not in effect yet)'
                          : ''}
                      </span>
                    ),
                  },
                  {
                    label: 'Published',
                    value: doc.publishedAt ? (
                      <span>
                        <DateTime value={doc.publishedAt} /> by{' '}
                        <AdminName id={doc.publishedBy} />
                      </span>
                    ) : (
                      'Not published'
                    ),
                  },
                  {
                    label: 'Re-consent',
                    value: doc.requiresReconsent
                      ? 'Users must accept this version again'
                      : 'Not required',
                  },
                  {
                    label: 'Created',
                    value: (
                      <span>
                        <DateTime value={doc.createdAt} /> by{' '}
                        <AdminName id={doc.createdByAdminId} />
                      </span>
                    ),
                  },
                  { label: 'Last changed', value: <DateTime value={doc.updatedAt} /> },
                  {
                    label: 'Public page',
                    value: <PublicLink doc={doc} />,
                  },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Changelog</CardTitle>
            </CardHeader>
            <CardContent>
              {doc.changelog ? (
                <p className="text-body whitespace-pre-line text-foreground">
                  {doc.changelog}
                </p>
              ) : (
                <p className="text-body text-foreground-muted">
                  No changelog was written.
                </p>
              )}
            </CardContent>
          </Card>

          {previous ? <ChangesCard doc={doc} against={previous} /> : null}

          <RawMarkdown markdown={doc.contentMarkdown} />
        </div>
      </div>

      {doc.status === 'DRAFT' && canPublish ? (
        <PublishDialog
          open={publishing}
          onOpenChange={setPublishing}
          draft={doc}
          active={active}
          onPublished={() => undefined}
        />
      ) : null}
    </div>
  )
}

function statusLine(doc: LegalDocument): string {
  if (doc.status === 'DRAFT')
    return 'A draft. Private until it is published; it can still be edited or deleted.'
  if (doc.status === 'PUBLISHED')
    return 'The version the apps show now. It is permanent and can’t be edited.'
  return 'Replaced by a newer version. Kept permanently as a record of what users were shown.'
}

function PublicLink({ doc }: { doc: LegalDocument }) {
  const { copy, copied } = useCopyToClipboard()
  const url = publicUrl(doc.documentType)
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="wrap-anywhere">{url.replace('https://', '')}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void copy(url)}
        aria-label={`Copy ${url}`}
      >
        <Copy /> {copied ? 'Copied' : 'Copy'}
      </Button>
      {doc.status !== 'PUBLISHED' ? (
        <span className="block w-full text-caption text-foreground-muted">
          Shows the active version, not this one.
        </span>
      ) : null}
    </span>
  )
}

function ChangesCard({ doc, against }: { doc: LegalDocument; against: LegalDocument }) {
  const changes = diffVersions(doc, against)
  const none =
    changes.added.length + changes.removed.length + changes.changed.length === 0 &&
    !changes.introChanged

  const list = (title: string, items: readonly string[], tone: string) =>
    items.length > 0 ? (
      <div>
        <p className={`text-caption font-medium ${tone}`}>{title}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-body">
          {items.map((heading, index) => (
            <li key={`${heading}-${index}`} className="wrap-anywhere">
              {heading}
            </li>
          ))}
        </ul>
      </div>
    ) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Changes since v{against.version}</CardTitle>
        <CardDescription>
          By section heading. Open both versions to read the wording.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {none ? (
          <p className="text-body text-foreground-muted">
            No section was added, removed or reworded.
          </p>
        ) : (
          <>
            {changes.introChanged ? (
              <p className="text-body">The intro was reworded.</p>
            ) : null}
            {list('Added', changes.added, 'text-success-foreground')}
            {list('Reworded', changes.changed, 'text-warning-foreground')}
            {list('Removed', changes.removed, 'text-danger-foreground')}
          </>
        )}
        <Button variant="outline" size="sm" asChild>
          <Link to={ROUTES.legalDoc(against.id)}>Open v{against.version}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function RawMarkdown({ markdown }: { markdown: string }) {
  const { copy, copied } = useCopyToClipboard()
  return (
    <Collapsible className="rounded-lg border border-border bg-card">
      <CollapsibleTrigger className="group flex w-full items-center justify-between px-6 py-4 text-left text-body-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        Markdown source
        <ChevronDown
          className="size-4 transition-transform group-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 px-6 pb-5">
        <Button variant="outline" size="sm" onClick={() => void copy(markdown)}>
          <Copy /> {copied ? 'Copied' : 'Copy Markdown'}
        </Button>
        <pre className="max-h-96 overflow-auto rounded-md bg-surface-muted p-3 font-mono text-caption whitespace-pre-wrap text-foreground">
          {markdown}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  )
}
