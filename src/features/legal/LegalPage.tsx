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
import { cn } from '@/lib/cn'
import { LEGAL_APP_TYPES, type LegalAppType, type LegalDocument } from '@/types/legal'

import {
  EditedCell,
  EffectiveCell,
  LegalStatusCell,
  PublishedCell,
  TitleCell,
  VersionCell,
} from './cells'
import {
  activeByType,
  APP_LABELS,
  byRecent,
  seriesLabel,
  TYPE_LABELS,
  TYPE_ORDER,
} from './labels'
import { PolicyCard } from './PolicyCard'
import { useLegalDocuments } from './useLegal'
import { useLegalParams, type LegalTab } from './useLegalParams'

/**
 * Legal & policies — `/legal` (plan.md §3.1, LG1, LB2).
 *
 * Each policy exists once per app. The app switch scopes the whole page; for
 * that app, four cards say what is live per policy, and the tabs hold the
 * drafts being written and the read-only record of everything published. One
 * query feeds all of it (see `useLegalDocuments`).
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

/**
 * Personal | Business (plan.md LB2, decision 1). The same control as the
 * bootstrap settings' app switch, so the panel has one way to pick an app.
 * Each segment says how many of the four policies are live for that app —
 * the number that matters while the Business set is being written.
 */
function AppSwitch({
  app,
  live,
  onSelect,
}: {
  app: LegalAppType
  /** Live policies per app; `undefined` while loading or after a failure. */
  live: Readonly<Record<LegalAppType, number>> | undefined
  onSelect: (next: LegalAppType) => void
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-overline text-foreground-muted">App</span>
      <div
        role="group"
        aria-label="App"
        className="inline-flex rounded-md border border-border bg-surface-muted p-0.5"
      >
        {LEGAL_APP_TYPES.map((value) => {
          const selected = value === app
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              aria-label={
                live
                  ? `${APP_LABELS[value]}, ${live[value]} of ${TYPE_ORDER.length} policies live`
                  : undefined
              }
              onClick={() => onSelect(value)}
              className={cn(
                'inline-flex touch-target items-center gap-2 rounded-sm px-4 text-body font-medium transition-colors',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                selected
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-foreground-muted hover:text-foreground',
              )}
            >
              {APP_LABELS[value]}
              {live ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'font-mono text-caption tabular-nums',
                    selected ? 'text-primary-foreground' : 'text-foreground-muted',
                  )}
                >
                  {live[value]}/{TYPE_ORDER.length}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function LegalPage() {
  const { app, tab, type, setApp, setTab, setType, showHistory } = useLegalParams()
  const canEdit = useCan(PERMISSIONS.legalEdit)
  const navigate = useNavigate()
  const query = useLegalDocuments()
  /* Everything below is one app's: a Business draft never passes for a Personal one. */
  const docs = (query.data ?? []).filter((doc) => doc.appType === app)
  const live = query.data
    ? {
        PERSONAL: Object.keys(activeByType(query.data, 'PERSONAL')).length,
        BUSINESS: Object.keys(activeByType(query.data, 'BUSINESS')).length,
      }
    : undefined
  const business = app === 'BUSINESS'
  const loading = query.isPending
  const active = activeByType(docs, app)

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
        rowLabel={(doc) =>
          `Edit ${seriesLabel(doc.documentType, doc.appType)} v${doc.version}`
        }
        onRowClick={(doc) =>
          void navigate(canEdit ? ROUTES.legalEdit(doc.id) : ROUTES.legalDoc(doc.id))
        }
        loading={loading}
        error={error}
        onRetry={() => void query.refetch()}
        emptyTitle={
          type
            ? `No ${seriesLabel(type, app)} drafts`
            : business
              ? 'No Business drafts in progress'
              : 'No drafts in progress'
        }
        emptyDescription="A draft is a new version being written. It stays private until it is published."
        emptyAction={
          clearType ??
          (canEdit ? (
            <Button variant="outline" asChild>
              <Link to={ROUTES.legalNew(undefined, undefined, app)}>
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
        rowLabel={(doc) =>
          `Open ${seriesLabel(doc.documentType, doc.appType)} v${doc.version}`
        }
        onRowClick={(doc) => void navigate(ROUTES.legalDoc(doc.id))}
        loading={loading}
        error={error}
        onRetry={() => void query.refetch()}
        emptyTitle={
          type
            ? `${seriesLabel(type, app)} has never been published`
            : business
              ? 'Nothing published for Business yet'
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
              <Link to={ROUTES.legalNew(type, undefined, app)}>
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

      <AppSwitch app={app} live={live} onSelect={setApp} />

      <section aria-label={`Active ${APP_LABELS[app]} policies`}>
        <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          {TYPE_ORDER.map((value) => (
            <li key={value} className="flex min-w-0">
              <PolicyCard
                type={value}
                app={app}
                active={active[value]}
                drafts={drafts.filter((doc) => doc.documentType === value)}
                loading={loading}
                unavailable={query.isError && !query.data}
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
