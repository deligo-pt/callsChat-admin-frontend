import { MoreHorizontal, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  DataList,
  DateRangePicker,
  ExportButton,
  FilterBar,
  Pagination,
  type AdminColumn,
  type DateRange,
  type SortState,
} from '@/components/data'
import {
  AuditTimeline,
  Caption,
  CopyableId,
  DateTime,
  DetailTabs,
  DiamondAmount,
  KeyValueGrid,
  MaskedValue,
  MoneyAmount,
  Overline,
  PageHeader,
  RecordHeader,
  StatusBadge,
} from '@/components/display'
import {
  ConfirmActionDialog,
  EmptyState,
  ErrorState,
  ForbiddenState,
  LoadingState,
  NotFoundState,
  RouteFallback,
  Spinner,
} from '@/components/feedback'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCurrentBreakpoint } from '@/lib/hooks/useBreakpoint'
import { knownStatuses, type StatusDomain } from '@/lib/status'

import { DEMO_AUDIT_ENTRIES, DEMO_USERS, type DemoUser } from './demoData'

/* ------------------------------------------------------------------------ */

function GallerySection({
  id,
  title,
  note,
  children,
}: {
  id: string
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <div className="space-y-1">
        <h2 className="text-h2">{title}</h2>
        {note ? <Caption>{note}</Caption> : null}
      </div>
      <div className="rounded-lg border border-border bg-surface p-4 sm:p-6">
        {children}
      </div>
    </section>
  )
}

const STATUS_DOMAINS: readonly StatusDomain[] = [
  'user',
  'hostApplication',
  'socialClub',
  'moderationCase',
  'withdrawal',
  'payment',
  'balance',
  'restriction',
  'notification',
]

/* ------------------------------------------------------------------------ */

/**
 * Component gallery (plan.md §1F).
 *
 * Dev-only route rendering every shared component in every state, so the
 * responsive matrix (360 / 768 / 1024 / 1440 / 1920) can be verified in one
 * place rather than by walking twelve modules.
 */
export function DesignGallery() {
  const breakpoint = useCurrentBreakpoint()

  const [sort, setSort] = useState<SortState>({
    field: 'displayName',
    direction: 'asc',
  })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [range, setRange] = useState<DateRange | undefined>(undefined)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [criticalOpen, setCriticalOpen] = useState(false)
  const [confirmResult, setConfirmResult] = useState<string | null>(null)

  /**
   * ONE column definition. `DataList` renders it as a table at lg and up, and
   * as record cards below — the core Phase 1 acceptance criterion.
   */
  const columns = useMemo<readonly AdminColumn<DemoUser>[]>(
    () => [
      {
        id: 'displayName',
        header: 'User',
        card: 'title',
        sticky: true,
        sortable: true,
        cell: (row) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.displayName}</div>
            <CopyableId value={row.id} label="User ID" maxLength={16} />
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        card: 'status',
        cell: (row) => <StatusBadge domain="user" value={row.status} />,
      },
      {
        id: 'phone',
        header: 'Contact',
        cell: (row) => <MaskedValue value={row.phone} kind="phone" />,
      },
      {
        id: 'restrictions',
        header: 'Restrictions',
        align: 'right',
        cell: (row) =>
          row.restrictions > 0 ? (
            <StatusBadge domain="restriction" value="GIFTING" />
          ) : (
            <span className="text-foreground-subtle">None</span>
          ),
      },
      {
        id: 'availableDiamonds',
        header: 'Available',
        align: 'right',
        sortable: true,
        cell: (row) => (
          <DiamondAmount amount={row.availableDiamonds} variant="available" size="sm" />
        ),
      },
      {
        id: 'registeredAt',
        header: 'Registered',
        sortable: true,
        defaultHidden: true,
        cell: (row) => <DateTime value={row.registeredAt} variant="date" />,
      },
      {
        id: 'lastActiveAt',
        header: 'Last active',
        sortable: true,
        cell: (row) => <DateTime value={row.lastActiveAt} relative />,
      },
    ],
    [],
  )

  return (
    <div className="space-y-10 pb-16">
      <PageHeader
        title="Design System"
        description="Every shared component, in every state. Resize the window to verify the responsive matrix."
        breadcrumbs={[{ label: 'Admin', to: '/' }, { label: 'Design System' }]}
        actions={
          <>
            <Button variant="outline">Secondary</Button>
            <Button>
              <Plus /> Primary action
            </Button>
          </>
        }
      />

      {/* Live breakpoint readout */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-primary-100 bg-primary-soft px-4 py-3">
        <span className="text-body">
          Active breakpoint:{' '}
          <strong className="font-mono text-primary-700">{breakpoint}</strong>
        </span>
        <Caption className="text-primary-700">
          Lists render as a table from <strong>lg</strong> and as record cards below —
          from a single column definition.
        </Caption>
      </div>

      {/* ---------------------------------------------------------------- */}
      <GallerySection
        id="buttons"
        title="Buttons"
        note="Six variants, four sizes, loading and disabled. Minimum 44px touch target below lg."
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="More">
              <MoreHorizontal />
            </Button>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button loading>Saving</Button>
            <Button disabled>Insufficient permission</Button>
            <Button variant="danger" loading>
              Banning
            </Button>
          </div>
        </div>
      </GallerySection>

      {/* ---------------------------------------------------------------- */}
      <GallerySection
        id="status"
        title="Status badges"
        note="Every value resolves through lib/status.ts. A component never receives a colour."
      >
        <div className="space-y-4">
          {STATUS_DOMAINS.map((domain) => (
            <div key={domain} className="space-y-2">
              <Overline>{domain.replace(/([A-Z])/g, ' $1')}</Overline>
              <div className="flex flex-wrap gap-2">
                {knownStatuses(domain).map((value) => (
                  <StatusBadge key={value} domain={domain} value={value} />
                ))}
              </div>
            </div>
          ))}
          <div className="space-y-2">
            <Overline>Unknown enum — degrades safely</Overline>
            <div className="flex flex-wrap gap-2">
              <StatusBadge domain="user" value="PENDING_DELETION" />
              <StatusBadge
                domain="withdrawal"
                value="AWAITING_PROVIDER"
                variant="dot"
              />
            </div>
          </div>
        </div>
      </GallerySection>

      {/* ---------------------------------------------------------------- */}
      <GallerySection
        id="values"
        title="Value display"
        note="Integer-safe formatters. Available and locked are never combined into one figure."
      >
        <KeyValueGrid
          items={[
            {
              label: 'Available Diamonds',
              value: <DiamondAmount amount={12480} variant="available" />,
            },
            {
              label: 'Locked for withdrawal',
              value: <DiamondAmount amount={10000} variant="locked" />,
            },
            {
              label: 'Gross payout',
              value: <MoneyAmount minorUnits={4000} currency="USD" />,
            },
            {
              label: 'Platform fee',
              value: <MoneyAmount minorUnits={-400} currency="USD" signed />,
            },
            {
              label: 'Net payout',
              value: <MoneyAmount minorUnits={3600} currency="USD" />,
            },
            {
              label: 'Zero-decimal currency',
              value: <MoneyAmount minorUnits={400000} currency="JPY" showCode />,
            },
            {
              label: 'Masked phone',
              value: <MaskedValue value="+8801712345678" kind="phone" />,
            },
            {
              label: 'Masked email (revealable)',
              value: (
                <MaskedValue value="ayesha.rahman@example.com" kind="email" canReveal />
              ),
            },
            {
              label: 'Payout reference',
              value: <MaskedValue value="acct_1M2n3B4v5C6x7Z" kind="reference" />,
            },
            {
              label: 'Correlation ID',
              value: (
                <CopyableId
                  value="corr_01JQZ8N4X7VYB2K9TREM5HWDCF"
                  label="Correlation ID"
                  maxLength={26}
                />
              ),
            },
            { label: 'Timestamp', value: <DateTime value="2026-08-19T05:22:11Z" /> },
            {
              label: 'Precise timestamp',
              value: <DateTime value="2026-08-19T05:22:11Z" variant="precise" />,
            },
          ]}
        />
      </GallerySection>

      {/* ---------------------------------------------------------------- */}
      <GallerySection
        id="list"
        title="List surface"
        note="Table at lg and up, record cards below — one column definition, two renderers."
      >
        <div className="space-y-4">
          <FilterBar
            search={
              <div className="space-y-1.5">
                <Label htmlFor="gallery-search">Search</Label>
                <Input
                  id="gallery-search"
                  placeholder="User ID, name or masked contact"
                />
              </div>
            }
            applied={[
              { id: 'status', label: 'Status', value: 'Active' },
              { id: 'host', label: 'Host', value: 'Yes' },
            ]}
            onRemove={() => {}}
            onClearAll={() => {}}
          >
            <div className="space-y-1.5">
              <Label htmlFor="gallery-status">Account status</Label>
              <Select defaultValue="all">
                <SelectTrigger id="gallery-status" className="w-full lg:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  <SelectItem value="BANNED">Banned</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DateRangePicker value={range} onChange={setRange} />

            <ExportButton
              canExport
              rowCount={DEMO_USERS.length}
              resource="users"
              scopeDescription="Status: Active · Host: Yes · All time"
              onExport={() => {}}
            />
          </FilterBar>

          <DataList
            rows={DEMO_USERS}
            columns={columns}
            rowKey={(row) => row.id}
            sort={sort}
            onSortChange={setSort}
            onRowClick={() => {}}
            rowActions={() => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Row actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>View detail</DropdownMenuItem>
                  <DropdownMenuItem>Add restriction</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          />

          <Pagination
            state={{
              page,
              pageSize,
              total: 1432,
              totalPages: Math.ceil(1432 / pageSize),
            }}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
          />
        </div>
      </GallerySection>

      {/* ---------------------------------------------------------------- */}
      <GallerySection
        id="record"
        title="Record detail"
        note="Header, tabs and metadata grid. Tabs become a scrollable pill row below md."
      >
        <div className="space-y-6">
          <RecordHeader
            title="Ayesha Rahman"
            badges={
              <>
                <StatusBadge domain="user" value="ACTIVE" />
                <StatusBadge domain="restriction" value="GIFTING" />
              </>
            }
            identifiers={
              <>
                <CopyableId value="usr_8Fk29ZqLm401" label="User ID" />
                <MaskedValue value="+8801712345678" kind="phone" />
                <span>
                  Registered <DateTime value="2026-03-14T09:12:00Z" variant="date" />
                </span>
              </>
            }
            actions={
              <>
                <Button variant="outline">Add restriction</Button>
                <Button variant="danger" onClick={() => setCriticalOpen(true)}>
                  Ban user
                </Button>
              </>
            }
          />

          <DetailTabs
            tabs={[
              {
                value: 'overview',
                label: 'Overview',
                content: (
                  <KeyValueGrid
                    items={[
                      { label: 'Display name', value: 'Ayesha Rahman' },
                      {
                        label: 'Account status',
                        value: <StatusBadge domain="user" value="ACTIVE" />,
                      },
                      { label: 'Host', value: 'Approved' },
                      { label: 'Country', value: 'Bangladesh' },
                      {
                        label: 'Registered',
                        value: <DateTime value="2026-03-14T09:12:00Z" />,
                      },
                      {
                        label: 'Last active',
                        value: <DateTime value="2026-08-19T06:41:00Z" relative />,
                      },
                    ]}
                  />
                ),
              },
              {
                value: 'access',
                label: 'Access & restrictions',
                count: 1,
                content: (
                  <EmptyState
                    title="No active restrictions"
                    description="This user has no capability restrictions in effect."
                  />
                ),
              },
              {
                value: 'sessions',
                label: 'Sessions & devices',
                content: <LoadingState variant="table" rows={3} />,
              },
              { value: 'safety', label: 'Safety', count: 3, content: <EmptyState /> },
              {
                value: 'finance',
                label: 'Finance summary',
                content: <ForbiddenState resource="finance records" />,
              },
              {
                value: 'audit',
                label: 'Audit history',
                content: <AuditTimeline entries={DEMO_AUDIT_ENTRIES} />,
              },
            ]}
          />
        </div>
      </GallerySection>

      {/* ---------------------------------------------------------------- */}
      <GallerySection
        id="states"
        title="Remote states"
        note="Every remote surface must render all five. Skeletons are shaped like their content."
      >
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-md border border-border">
            <EmptyState />
          </div>
          <div className="rounded-md border border-border">
            <ErrorState
              correlationId="corr_01JQZ8N4X7VYB2K9TREM5HWDCF"
              onRetry={() => {}}
            />
          </div>
          <div className="rounded-md border border-border">
            <ForbiddenState resource="withdrawal records" />
          </div>
          <div className="rounded-md border border-border">
            <NotFoundState />
          </div>
          <div className="xl:col-span-2">
            <Overline className="mb-2 block">Loading — table</Overline>
            <LoadingState variant="table" rows={3} />
          </div>
          <div>
            <Overline className="mb-2 block">Loading — cards</Overline>
            <LoadingState variant="cards" rows={2} />
          </div>
          <div>
            <Overline className="mb-2 block">Loading — detail</Overline>
            <LoadingState variant="detail" />
          </div>
          <div className="xl:col-span-2">
            <Overline className="mb-2 block">
              Spinner — route transitions and the session bootstrap
            </Overline>
            <div className="flex flex-wrap items-center gap-6 rounded-md border border-border p-4">
              <Spinner size="sm" />
              <Spinner size="md" />
              <Spinner size="lg" />
              <div className="min-w-60 flex-1 rounded-md border border-border">
                <RouteFallback />
              </div>
            </div>
          </div>
        </div>
      </GallerySection>

      {/* ---------------------------------------------------------------- */}
      <GallerySection
        id="confirm"
        title="Confirm action dialog"
        note="The single gateway for every sensitive action. A reason is always mandatory."
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setConfirmOpen(true)}>
              Approve withdrawal (warning)
            </Button>
            <Button variant="danger" onClick={() => setCriticalOpen(true)}>
              Ban user (critical + typed confirmation)
            </Button>
          </div>

          {confirmResult ? (
            <p className="rounded-md bg-success-soft px-3 py-2 text-body text-success-foreground">
              Confirmed with reason: “{confirmResult}”
            </p>
          ) : (
            <Caption>
              Try submitting with an empty reason — the dialog blocks it and explains
              why.
            </Caption>
          )}

          <ConfirmActionDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            severity="warning"
            title="Approve withdrawal"
            target="WD-10482 · Ayesha Rahman · 10,000 Diamonds"
            effect="The request becomes eligible for payout processing. It does not send money — completion happens only after the provider confirms."
            confirmLabel="Approve"
            onConfirm={(reason) => {
              setConfirmResult(reason)
              setConfirmOpen(false)
            }}
            details={
              <KeyValueGrid
                columns={2}
                items={[
                  {
                    label: 'Requested',
                    value: <DiamondAmount amount={10000} variant="locked" />,
                  },
                  {
                    label: 'Gross payout',
                    value: <MoneyAmount minorUnits={4000} currency="USD" />,
                  },
                  {
                    label: 'Platform fee',
                    value: <MoneyAmount minorUnits={-400} currency="USD" signed />,
                  },
                  {
                    label: 'Net payout',
                    value: <MoneyAmount minorUnits={3600} currency="USD" />,
                  },
                ]}
              />
            }
          />

          <ConfirmActionDialog
            open={criticalOpen}
            onOpenChange={setCriticalOpen}
            severity="critical"
            title="Ban user"
            target="Ayesha Rahman (usr_8Fk29ZqLm401)"
            effect="This user is signed out immediately and cannot sign in again until explicitly restored under policy."
            typedConfirmation="BAN"
            confirmLabel="Ban user"
            onConfirm={(reason) => {
              setConfirmResult(reason)
              setCriticalOpen(false)
            }}
          />
        </div>
      </GallerySection>
    </div>
  )
}
