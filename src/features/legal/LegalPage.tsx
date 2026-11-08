import { FilePlus2, Info } from 'lucide-react'
import { Link, useNavigate } from 'react-router'

import { isAppError } from '@/api/errors'
import { ROUTES } from '@/app/routes'
import { PERMISSIONS } from '@/auth/permissions'
import { useCan } from '@/auth/useAuth'
import { DataList, type AdminColumn } from '@/components/data'
import { DetailTabs, PageHeader } from '@/components/display'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { LegalDocument } from '@/types/legal'

import {
  EditedCell,
  EffectiveCell,
  LegalStatusCell,
  PublishedCell,
  TitleCell,
  VersionCell,
} from './cells'
import { activeByType, byRecent, TYPE_LABELS, TYPE_ORDER, typeLabel } from './labels'
import { PolicyCard } from './PolicyCard'
import { useLegalDocuments } from './useLegal'
import { useLegalParams, type LegalTab } from './useLegalParams'

/**
 * Legal & policies — `/legal` (plan.md §3.1, LG1).
 *
 * Four cards say what is live per policy; the tabs hold the drafts being
 * written and the read-only record of everything published. One query feeds
 * all of it (see `useLegalDocuments`). Read-only in LG1.
 */

const DRAFT_COLUMNS: readonly AdminColumn<LegalDocument>[] = [
  {
    id: 'policy',
    header: 'Policy',
    cell: (doc) => <TitleCell doc={doc} />,
    card: 'title',
  },
  {
    id: 'version',
    header: 'Version',
    cell: (doc) => <VersionCell doc={doc} />,
    card: 'status',
  },
  { id: 'effective', header: 'Effective', cell: (doc) => <EffectiveCell doc={doc} /> },
  { id: 'edited', header: 'Last edited', cell: (doc) => <EditedCell doc={doc} /> },
]

const HISTORY_COLUMNS: readonly AdminColumn<LegalDocument>[] = [
  {
    id: 'policy',
    header: 'Policy',
    cell: (doc) => <TitleCell doc={doc} />,
    card: 'title',
  },
  {
    id: 'status',
    header: 'Status',
    cell: (doc) => <LegalStatusCell doc={doc} />,
    card: 'status',
  },
  { id: 'version', header: 'Version', cell: (doc) => <VersionCell doc={doc} /> },
  { id: 'effective', header: 'Effective', cell: (doc) => <EffectiveCell doc={doc} /> },
  { id: 'published', header: 'Published', cell: (doc) => <PublishedCell doc={doc} /> },
]

const ALL = 'ALL'

export function LegalPage() {
  const { tab, type, setTab, setType, showHistory } = useLegalParams()
  const canEdit = useCan(PERMISSIONS.legalEdit)
  const navigate = useNavigate()
  const query = useLegalDocuments()
  const docs = query.data ?? []
  const loading = query.isPending
  const active = activeByType(docs)

  const ofType = (doc: LegalDocument) => !type || doc.documentType === type
  const drafts = docs.filter((doc) => doc.status === 'DRAFT').sort(byRecent)
  const history = docs.filter((doc) => doc.status !== 'DRAFT').sort(byRecent)
  const shownDrafts = drafts.filter(ofType)
  const shownHistory = history.filter(ofType)

  const error = query.isError
    ? {
        message: isAppError(query.error)
          ? query.error.message
          : 'The legal documents could not be loaded.',
        ...(isAppError(query.error) && query.error.correlationId
          ? { correlationId: query.error.correlationId }
          : {}),
      }
    : null

  const clearType = type ? (
    <Button variant="outline" onClick={() => setType(null)}>
      Show all policies
    </Button>
  ) : undefined

  const typeFilter = (
    <div className="flex flex-col gap-1.5 sm:max-w-xs">
      <Label htmlFor="legal-type" className="text-caption text-foreground-muted">
        Policy
      </Label>
      <Select
        value={type ?? ALL}
        onValueChange={(value) =>
          setType(value === ALL ? null : (value as LegalDocument['documentType']))
        }
      >
        <SelectTrigger id="legal-type" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All policies</SelectItem>
          {TYPE_ORDER.map((value) => (
            <SelectItem key={value} value={value}>
              {TYPE_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  const draftsBody = (
    <div className="space-y-4">
      {typeFilter}
      <DataList
        rows={shownDrafts}
        columns={DRAFT_COLUMNS}
        rowKey={(doc) => doc.id}
        rowLabel={(doc) => `Edit ${typeLabel(doc.documentType)} v${doc.version}`}
        onRowClick={(doc) =>
          void navigate(canEdit ? ROUTES.legalEdit(doc.id) : ROUTES.legalDoc(doc.id))
        }
        loading={loading}
        error={error}
        onRetry={() => void query.refetch()}
        emptyTitle={type ? `No ${TYPE_LABELS[type]} drafts` : 'No drafts in progress'}
        emptyDescription="A draft is a new version being written. It stays private until it is published."
        emptyAction={
          clearType ??
          (canEdit ? (
            <Button variant="outline" asChild>
              <Link to={ROUTES.legalNew()}>
                <FilePlus2 /> New draft
              </Link>
            </Button>
          ) : undefined)
        }
      />
    </div>
  )

  const historyBody = (
    <div className="space-y-4">
      {typeFilter}
      <DataList
        rows={shownHistory}
        columns={HISTORY_COLUMNS}
        rowKey={(doc) => doc.id}
        rowLabel={(doc) => `Open ${typeLabel(doc.documentType)} v${doc.version}`}
        onRowClick={(doc) => void navigate(ROUTES.legalDoc(doc.id))}
        loading={loading}
        error={error}
        onRetry={() => void query.refetch()}
        emptyTitle={
          type
            ? `${TYPE_LABELS[type]} has never been published`
            : 'Nothing published yet'
        }
        emptyDescription="Published versions are kept here permanently, including the ones a newer version replaced. They can't be edited or deleted."
        emptyAction={clearType}
      />
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Legal & policies"
        description="The privacy policy, terms and other legal documents the apps and website show. A published version is permanent: to change it, publish a new version."
        actions={
          canEdit ? (
            <Button asChild>
              <Link to={ROUTES.legalNew(type)}>
                <FilePlus2 /> New draft
              </Link>
            </Button>
          ) : null
        }
      />

      <Alert>
        <Info aria-hidden="true" />
        <AlertTitle>The website doesn't read these yet</AlertTitle>
        <AlertDescription>
          callschat.com still shows its built-in policy text. Publishing here updates
          the API that the apps read; the website follows once it is switched over.
        </AlertDescription>
      </Alert>

      <section aria-label="Active policies">
        <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          {TYPE_ORDER.map((value) => (
            <li key={value} className="flex min-w-0">
              <PolicyCard
                type={value}
                active={active[value]}
                drafts={drafts.filter((doc) => doc.documentType === value)}
                loading={loading}
                onShowHistory={() => showHistory(value)}
                canEdit={canEdit}
              />
            </li>
          ))}
        </ul>
      </section>

      <DetailTabs
        value={tab}
        onValueChange={(value) => setTab(value as LegalTab)}
        tabs={[
          {
            value: 'drafts',
            label: 'Drafts',
            ...(query.data ? { count: shownDrafts.length } : {}),
            content: tab === 'drafts' ? draftsBody : null,
          },
          {
            value: 'history',
            label: 'History',
            ...(query.data ? { count: shownHistory.length } : {}),
            content: tab === 'history' ? historyBody : null,
          },
        ]}
      />
    </div>
  )
}
