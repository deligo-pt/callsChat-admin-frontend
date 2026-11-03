import { useLocation, useNavigate } from 'react-router'

import { isAppError } from '@/api/errors'
import { ROUTES } from '@/app/routes'
import { PERMISSIONS } from '@/auth/permissions'
import { useCan } from '@/auth/useAuth'
import {
  DataList,
  FilterBar,
  Pagination,
  type AdminColumn,
  type AppliedFilter,
} from '@/components/data'
import { PageHeader } from '@/components/display'
import { Button } from '@/components/ui/button'
import { useUserName } from '@/components/wallet'
import { formatDate } from '@/lib/datetime'
import { formatCount } from '@/lib/format'
import { useIsTableViewport } from '@/lib/hooks/useBreakpoint'
import { LEDGER_TIME_ZONE, typeLabel } from '@/lib/walletLabels'
import type { WalletTransaction } from '@/types/walletTransactions'

import {
  AccountCell,
  AmountCell,
  BalanceCell,
  NoteCell,
  SourceCell,
  TypeCell,
  WhenCell,
} from './cells'
import { SummaryStrip } from './SummaryStrip'
import { WalletFilters, WalletSearch } from './WalletFilters'
import { useWalletLedgerQuery } from './useWalletLedger'
import { useWalletLedgerParams, type WalletFilterKey } from './useWalletLedgerParams'

/**
 * The wallet ledger — `GET /admin/wallet/transactions` (plan.md §4–§5, T2).
 *
 * Every diamond movement on every wallet: top-ups, adjustments, gifts,
 * conversions. Until this endpoint, an adjustment or a top-up was written to
 * the real wallet and could be seen nowhere in the panel.
 *
 * Every filter round-trips through the URL and is checked on the way in
 * (`useWalletLedgerParams`): the API answers `400` to a blank, lower-case or
 * malformed value, so one bad value in a pasted link would otherwise fail the
 * whole page.
 *
 * ⚠️ What the API cannot do is not offered: no maximum amount (B1), no sort
 * by amount. The direction filter says what it leaves out (B2), and the
 * summary is corrected for it (B3).
 */

const COLUMNS: readonly AdminColumn<WalletTransaction>[] = [
  { id: 'when', header: 'When', cell: (row) => <WhenCell row={row} />, card: 'meta' },
  {
    id: 'account',
    header: 'Account',
    cell: (row) => <AccountCell row={row} />,
    card: 'title',
  },
  { id: 'type', header: 'Type', cell: (row) => <TypeCell row={row} />, card: 'meta' },
  {
    id: 'amount',
    header: 'Diamonds',
    cell: (row) => <AmountCell row={row} />,
    card: 'meta',
  },
  {
    id: 'balance',
    header: 'Balance after',
    cell: (row) => <BalanceCell row={row} />,
    card: 'meta',
  },
  { id: 'note', header: 'Note', cell: (row) => <NoteCell row={row} />, card: 'meta' },
  {
    id: 'source',
    header: 'Source',
    cell: (row) => <SourceCell row={row} />,
    card: 'meta',
  },
]

const FILTER_LABELS: Record<WalletFilterKey, string> = {
  search: 'Search',
  type: 'Type',
  direction: 'Direction',
  fromDate: 'From',
  toDate: 'To',
  minAmount: 'At least',
  userId: 'Account',
}

/**
 * The account's name for its chip, from the rows: filtered by `userId`, every
 * row is theirs. Never a name from a row that is not theirs, and never the
 * raw id.
 */
function accountName(
  rows: readonly WalletTransaction[],
  id: string,
  looked: string | null | undefined,
): string {
  const user = rows[0]?.user
  if (rows[0]?.userId === id && user?.displayName?.trim())
    return user.displayName.trim()
  /*
   * No rows to read it from (an empty view): the record's name, else plain
   * words — never the raw id, which means nothing to an operator (T6).
   */
  return looked?.trim() || 'This account'
}

/** A day picked in Bangladesh time, shown the way the rest of the panel shows dates. */
function dayLabel(day: string): string {
  return formatDate(`${day}T00:00:00+06:00`, { timeZone: LEDGER_TIME_ZONE })
}

export function WalletTransactionsPage() {
  const {
    query,
    filters,
    page,
    limit,
    oldestFirst,
    setFilter,
    setDateRange,
    setPage,
    setLimit,
    setOldestFirst,
    clearAll,
    activeFilterCount,
  } = useWalletLedgerParams()
  const isDesktop = useIsTableViewport()
  const navigate = useNavigate()
  const location = useLocation()

  const list = useWalletLedgerQuery(query)
  const rows = list.data?.data ?? []
  const pagination = list.data?.pagination
  const filtered = activeFilterCount > 0

  /* Total known and rows empty: past the end, not "nothing matches". */
  const pastEnd = !list.isPending && rows.length === 0 && (pagination?.total ?? 0) > 0

  /* Only needed when the view is empty — otherwise a row carries the name. */
  const canReadUsers = useCan(PERMISSIONS.usersView)
  const accountLookup = useUserName(
    filters.userId ?? '',
    canReadUsers && !list.isPending && rows.length === 0 && Boolean(filters.userId),
  )

  const applied: AppliedFilter[] = (
    Object.entries(filters) as [WalletFilterKey, string][]
  ).map(([key, value]) => {
    let display = value
    if (key === 'type') display = typeLabel(value)
    if (key === 'direction') display = value === 'CREDIT' ? 'Credits' : 'Debits'
    if (key === 'fromDate' || key === 'toDate') display = dayLabel(value)
    if (key === 'minAmount') display = `${formatCount(Number(value))} Diamonds`
    if (key === 'userId')
      display = accountName(rows, value, accountLookup.data?.displayName)
    return { id: key, label: FILTER_LABELS[key], value: display }
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wallet transactions"
        description="Every diamond movement on every wallet — top-ups, adjustments, gifts and conversions. Times are Bangladesh time (GMT+6)."
        toolbar={
          <FilterBar
            applied={applied}
            onRemove={(id) => {
              if (id === 'fromDate') setDateRange(undefined, filters.toDate)
              else if (id === 'toDate') setDateRange(filters.fromDate, undefined)
              else setFilter(id as WalletFilterKey, undefined)
            }}
            onClearAll={clearAll}
            {...(isDesktop
              ? {}
              : {
                  search: (
                    <WalletSearch
                      value={filters.search}
                      onCommit={(value) => setFilter('search', value)}
                      hideLabel
                    />
                  ),
                })}
          >
            <WalletFilters
              filters={filters}
              oldestFirst={oldestFirst}
              withSearch={isDesktop}
              setFilter={setFilter}
              setDateRange={setDateRange}
              setOldestFirst={setOldestFirst}
            />
          </FilterBar>
        }
      />

      <SummaryStrip
        summary={list.data?.summary}
        direction={filters.direction}
        filtered={filtered}
        loading={list.isPending}
      />

      <DataList
        rows={rows}
        columns={COLUMNS}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.user?.displayName ?? row.id}
        onRowClick={(row) =>
          void navigate(ROUTES.walletTransaction(row.id), {
            state: { from: location.search },
          })
        }
        loading={list.isPending}
        error={
          list.isError
            ? {
                message: isAppError(list.error)
                  ? list.error.message
                  : 'The wallet ledger could not be loaded.',
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
              ? 'No transactions match this view'
              : 'No wallet transactions yet'
        }
        emptyDescription={
          pastEnd
            ? `There are ${formatCount(pagination?.total ?? 0)} transactions in this view, all on earlier pages.`
            : filtered
              ? 'Nothing moved under these filters. Clearing them shows every transaction.'
              : 'Top-ups, adjustments and gifts appear here as they happen.'
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
          {formatCount(pagination.total)} transactions found.
        </p>
      ) : null}
    </div>
  )
}
