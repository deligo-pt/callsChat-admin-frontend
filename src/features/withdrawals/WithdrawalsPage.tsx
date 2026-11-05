import { Settings2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { isAppError } from '@/api/errors'
import { ROUTES } from '@/app/routes'
import { PERMISSIONS } from '@/auth/permissions'
import { useCan } from '@/auth/useAuth'
import {
  DataList,
  ExportButton,
  FilterBar,
  Pagination,
  type AdminColumn,
  type AppliedFilter,
} from '@/components/data'
import { DetailTabs, PageHeader } from '@/components/display'
import { Button } from '@/components/ui/button'
import { useUserName } from '@/components/wallet'
import { formatDate } from '@/lib/datetime'
import { formatCount } from '@/lib/format'
import { useIsTableViewport } from '@/lib/hooks/useBreakpoint'
import {
  withdrawalHostName,
  type Withdrawal,
  type WithdrawalStats,
} from '@/types/withdrawals'

import {
  AmountCell,
  HostCell,
  MethodCell,
  ProcessedByCell,
  RequestedCell,
  StatusCell,
} from './cells'
import {
  EXPORT_ROW_CAP,
  fetchAllWithdrawals,
  saveCsv,
  withdrawalsCsv,
} from './exportCsv'
import { SORT_OPTIONS, STATUS_LABELS, WITHDRAWAL_TIME_ZONE } from './labels'
import { WithdrawalFilters, WithdrawalSearch } from './WithdrawalFilters'
import { WithdrawalKpiStrip } from './WithdrawalKpiStrip'
import {
  useWithdrawalParams,
  type WithdrawalFilterKey,
  type WithdrawalTab,
} from './useWithdrawalParams'
import { useWithdrawalsQuery, useWithdrawalStats } from './useWithdrawals'

/**
 * Withdrawals — `/withdrawals` (plan.md W1).
 *
 * Opens on **Pending**, the queue that needs someone. Status is the tab bar;
 * search, dates and order are in the filter bar; all of it is in the URL. A
 * row opens the request (W2), carrying this view's query so "back" returns.
 */

const COLUMNS: readonly AdminColumn<Withdrawal>[] = [
  { id: 'host', header: 'Host', cell: (row) => <HostCell row={row} />, card: 'title' },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => <StatusCell status={row.status} />,
    card: 'status',
  },
  {
    id: 'amount',
    header: 'Net payout',
    cell: (row) => <AmountCell row={row} />,
    align: 'right',
    card: 'meta',
  },
  {
    id: 'method',
    header: 'Pay to',
    cell: (row) => <MethodCell snapshot={row.paymentSnapshot} />,
    card: 'meta',
  },
  {
    id: 'requested',
    header: 'Requested',
    cell: (row) => <RequestedCell row={row} />,
    card: 'meta',
  },
  {
    id: 'processedBy',
    header: 'Processed by',
    cell: (row) => <ProcessedByCell row={row} />,
    card: 'meta',
  },
]

const FILTER_LABELS: Record<WithdrawalFilterKey, string> = {
  search: 'Search',
  userId: 'Host',
  fromDate: 'From',
  toDate: 'To',
}

const TABS: readonly WithdrawalTab[] = [
  'PENDING',
  'APPROVED',
  'PAID',
  'REJECTED',
  'CANCELLED',
  'ALL',
]

function tabCount(tab: WithdrawalTab, stats: WithdrawalStats | undefined) {
  if (!stats) return {}
  switch (tab) {
    case 'PENDING':
      return { count: stats.pending.count }
    case 'APPROVED':
      return { count: stats.approved.count }
    default:
      return {}
  }
}

function dayLabel(day: string): string {
  return formatDate(`${day}T00:00:00+06:00`, { timeZone: WITHDRAWAL_TIME_ZONE })
}

export function WithdrawalsPage() {
  const {
    tab,
    filters,
    sortBy,
    sortOrder,
    page,
    limit,
    query,
    setTab,
    setFilter,
    setDateRange,
    setSort,
    setPage,
    setLimit,
    clearAll,
    activeFilterCount,
  } = useWithdrawalParams()
  const isDesktop = useIsTableViewport()
  const navigate = useNavigate()
  const location = useLocation()
  const canReadUsers = useCan(PERMISSIONS.usersView)
  const canSeeSettings = useCan(PERMISSIONS.withdrawalsView)
  const canExport = useCan(PERMISSIONS.exportData)
  const [exporting, setExporting] = useState(false)

  const stats = useWithdrawalStats()
  const list = useWithdrawalsQuery(query)
  const rows = list.data?.data ?? []
  const pagination = list.data?.pagination
  const filtered = activeFilterCount > 0
  const pastEnd = !list.isPending && rows.length === 0 && (pagination?.total ?? 0) > 0
  const sorted = !(sortBy === 'createdAt' && sortOrder === 'desc')

  const hostLookup = useUserName(
    filters.userId ?? '',
    canReadUsers && Boolean(filters.userId) && rows.length === 0 && !list.isPending,
  )
  const first = rows[0]
  const hostChip =
    first && first.userId === filters.userId
      ? withdrawalHostName(first)
      : hostLookup.data?.displayName?.trim() || 'This host'

  const applied: AppliedFilter[] = [
    ...(Object.entries(filters) as [WithdrawalFilterKey, string][]).map(
      ([key, value]) => ({
        id: key,
        label: FILTER_LABELS[key],
        value:
          key === 'fromDate' || key === 'toDate'
            ? dayLabel(value)
            : key === 'userId'
              ? hostChip
              : value,
      }),
    ),
    ...(sorted
      ? [
          {
            id: 'sort',
            label: 'Order',
            value:
              SORT_OPTIONS.find((option) => option.value === `${sortBy}:${sortOrder}`)
                ?.label ?? 'Custom',
          },
        ]
      : []),
  ]

  const noun =
    tab === 'ALL' ? 'requests' : `${STATUS_LABELS[tab].toLowerCase()} requests`

  const exportScope = [
    `Tab: ${STATUS_LABELS[tab]}`,
    ...applied.map((chip) => `${chip.label}: ${chip.value}`),
  ].join(' · ')

  function runExport() {
    setExporting(true)
    fetchAllWithdrawals(query)
      .then(({ rows: all, truncated }) => {
        const day = new Date().toISOString().slice(0, 10)
        saveCsv(withdrawalsCsv(all), `withdrawals-${tab.toLowerCase()}-${day}.csv`)
        if (truncated) {
          toast.warning(
            `Exported the first ${formatCount(EXPORT_ROW_CAP)} requests. Narrow the dates to export the rest.`,
          )
        } else {
          toast.success(`Exported ${formatCount(all.length)} ${noun}.`)
        }
      })
      .catch((error: unknown) =>
        toast.error(
          isAppError(error) ? error.message : 'The export could not be generated.',
        ),
      )
      .finally(() => setExporting(false))
  }

  const body = (
    <div className="space-y-4">
      <FilterBar
        applied={applied}
        onRemove={(id) => {
          if (id === 'sort') setSort('createdAt', 'desc')
          else if (id === 'fromDate') setDateRange(undefined, filters.toDate)
          else if (id === 'toDate') setDateRange(filters.fromDate, undefined)
          else setFilter(id as WithdrawalFilterKey, undefined)
        }}
        onClearAll={clearAll}
        {...(isDesktop
          ? {}
          : {
              search: (
                <WithdrawalSearch
                  value={filters.search}
                  onCommit={(value) => setFilter('search', value)}
                  hideLabel
                />
              ),
            })}
      >
        <WithdrawalFilters
          filters={filters}
          sortBy={sortBy}
          sortOrder={sortOrder}
          withSearch={isDesktop}
          setFilter={setFilter}
          setDateRange={setDateRange}
          setSort={setSort}
        />
      </FilterBar>

      <DataList
        rows={rows}
        columns={COLUMNS}
        rowKey={(row) => row.id}
        rowLabel={(row) => `Withdrawal by ${withdrawalHostName(row)}`}
        onRowClick={(row) =>
          void navigate(ROUTES.withdrawal(row.id), { state: { from: location.search } })
        }
        loading={list.isPending}
        error={
          list.isError
            ? {
                message: isAppError(list.error)
                  ? list.error.message
                  : 'The withdrawals could not be loaded.',
                ...(isAppError(list.error) && list.error.correlationId
                  ? { correlationId: list.error.correlationId }
                  : {}),
              }
            : null
        }
        onRetry={() => void list.refetch()}
        emptyTitle={
          pastEnd
            ? 'This page is past the end'
            : filtered
              ? 'No requests match this view'
              : tab === 'PENDING'
                ? 'Nothing waiting for review'
                : tab === 'APPROVED'
                  ? 'Nothing waiting to be paid'
                  : `No ${noun}`
        }
        emptyDescription={
          pastEnd
            ? `There are ${formatCount(pagination?.total ?? 0)} ${noun} in this view, all on earlier pages.`
            : filtered
              ? 'Nothing matches these filters. Clearing them shows every request in this tab.'
              : tab === 'PENDING'
                ? 'New requests from hosts appear here. This list refreshes every 30 seconds.'
                : 'Requests appear here once they reach this state.'
        }
        emptyAction={
          pastEnd ? (
            <Button variant="outline" onClick={() => setPage(1)}>
              Go to the first page
            </Button>
          ) : filtered ? (
            <Button variant="outline" onClick={clearAll}>
              Clear filters
            </Button>
          ) : tab !== 'ALL' ? (
            <Button variant="outline" onClick={() => setTab('ALL')}>
              See all requests
            </Button>
          ) : undefined
        }
      />

      {pagination && pagination.total > 0 && !pastEnd ? (
        <Pagination
          state={{
            page,
            pageSize: limit,
            total: pagination.total,
            totalPages: pagination.totalPages,
          }}
          onPageChange={setPage}
          onPageSizeChange={setLimit}
        />
      ) : null}

      {pagination ? (
        <p className="sr-only" role="status">
          {formatCount(pagination.total)} {noun} found.
        </p>
      ) : null}
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Withdrawals"
        description="Hosts asking to cash out their diamonds. Review, pay outside the panel, then record the TrxID. Times are Bangladesh time (GMT+6)."
        actions={
          <>
            <ExportButton
              canExport={canExport}
              rowCount={pagination?.total ?? 0}
              resource="withdrawal requests"
              scopeDescription={exportScope}
              loading={exporting}
              reason="none"
              effect="Every request in this view is downloaded as a CSV file to this device. It includes host names, emails, account holder names and TrxIDs; account numbers are cut to the last four digits. The file is built in your browser, so it is not recorded in the audit log."
              onExport={runExport}
            />
            {canSeeSettings ? (
              <Button variant="outline" asChild>
                <Link to={ROUTES.withdrawalSettings}>
                  <Settings2 /> Withdrawal settings
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <WithdrawalKpiStrip
        stats={stats.data}
        loading={stats.isPending}
        failed={stats.isError}
        onOpen={setTab}
      />

      <DetailTabs
        value={tab}
        onValueChange={(value) => setTab(value as WithdrawalTab)}
        tabs={TABS.map((value) => ({
          value,
          label: STATUS_LABELS[value],
          ...tabCount(value, stats.data),
          content: tab === value ? body : null,
        }))}
      />
    </div>
  )
}
