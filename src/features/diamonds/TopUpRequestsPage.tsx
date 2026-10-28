import { useState } from 'react'

import { isAppError } from '@/api/errors'
import { PageHeader } from '@/components/display'
import {
  DataList,
  FilterBar,
  Pagination,
  type AdminColumn,
  type AppliedFilter,
} from '@/components/data'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PAYMENT_METHODS, TOP_UP_STATUSES, type TopUpRequest } from '@/types/wallet'

import {
  AmountCell,
  MethodCell,
  PayerCell,
  ReferenceCell,
  StatusCell,
  SubmittedCell,
} from './cells'
import { ANY } from './listParams'
import { TopUpDrawer } from './TopUpDrawer'
import { useTopUpListParams } from './useTopUpListParams'
import { useTopUpRequestListQuery } from './useWallet'

/**
 * The manual top-up queue (plan.md §5, phase W2).
 *
 * ⚠️ **The empty state is this screen's main path, not its edge case.** The
 * live service holds **zero** requests, so "nothing at all" is what an
 * operator gets today. Three remote states have to stay distinguishable and
 * flattening any two tells them something untrue:
 *
 *   - **nothing at all** — the queue is genuinely empty; nothing is wrong, and
 *     nothing is pending anyone's attention;
 *   - **nothing matches** — filters are narrowing a non-empty table, so the
 *     fix is in the operator's hands;
 *   - **the request failed** — the counts and rows are unknown, and the screen
 *     must not tell an operator the queue is empty when it is unknown. On a
 *     queue of unverified payments that difference is the difference between
 *     "no one is waiting" and "you cannot see who is waiting".
 *
 * ⚠️ **No stats strip.** There is no counters endpoint for this queue — unlike
 * host applications, which had one until it regressed (plan.md O5, O1). Six
 * `limit=1` probes could synthesise one, as W0 does for the host strip, but
 * that was a splint for a route that used to exist. Inventing the same cost
 * here for a strip nobody has asked for would make a workaround look like a
 * design. The pager's total is the only count on the page, and it is honest.
 */

const COLUMNS: readonly AdminColumn<TopUpRequest>[] = [
  {
    id: 'payer',
    header: 'Payer',
    cell: (row) => <PayerCell record={row} />,
    card: 'title',
  },
  {
    id: 'amount',
    header: 'Amount',
    cell: (row) => <AmountCell record={row} />,
    card: 'meta',
  },
  {
    id: 'method',
    header: 'Method',
    cell: (row) => <MethodCell record={row} />,
    card: 'meta',
  },
  {
    id: 'reference',
    header: 'Reference',
    cell: (row) => <ReferenceCell record={row} />,
    card: 'meta',
  },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => <StatusCell record={row} />,
    card: 'status',
  },
  {
    id: 'submitted',
    header: 'Submitted',
    cell: (row) => <SubmittedCell record={row} />,
    card: 'meta',
  },
]

export function TopUpRequestsPage() {
  const {
    query,
    status,
    method,
    search,
    startDate,
    endDate,
    page,
    limit,
    setStatus,
    setMethod,
    setSearch,
    setDateRange,
    setPage,
    setLimit,
    clearAll,
    activeFilterCount,
  } = useTopUpListParams()

  const list = useTopUpRequestListQuery(query)
  const [openId, setOpenId] = useState<string | null>(null)

  const rows = list.data?.data ?? []

  /*
   * ⚠️ **The drawer reads its row out of this list, because there is no detail
   * route.** `GET /admin/wallet/requests/:id` answers `ROUTE_NOT_FOUND`
   * (measured 2026-10-27). Looked up by id on every render rather than copied
   * into state on click, so that a refetch after a review updates what the
   * drawer shows instead of leaving a stale copy open.
   */
  const openRequest = rows.find((row) => row.id === openId) ?? null
  const pagination = list.data?.pagination

  const applied: AppliedFilter[] = [
    ...(status !== ANY ? [{ id: 'status', label: 'Status', value: status }] : []),
    ...(method !== ANY
      ? [{ id: 'method', label: 'Method', value: method.replace(/_/g, ' ') }]
      : []),
    ...(search ? [{ id: 'search', label: 'Search', value: search }] : []),
    ...(startDate ? [{ id: 'startDate', label: 'From', value: startDate }] : []),
    ...(endDate ? [{ id: 'endDate', label: 'To', value: endDate }] : []),
  ]

  function removeFilter(id: string) {
    if (id === 'status') setStatus(ANY)
    else if (id === 'method') setMethod(ANY)
    else if (id === 'search') setSearch(undefined)
    else if (id === 'startDate') setDateRange(undefined, endDate)
    else if (id === 'endDate') setDateRange(startDate, undefined)
  }

  /*
   * ⚠️ Reads the filter count, not the row count. An empty result with filters
   * applied means something different from an empty result without them.
   */
  const filtered = activeFilterCount > 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Top-up requests"
        description="Payments users say they have made. Approving one credits their diamond balance immediately and cannot be undone here."
      />

      <FilterBar
        applied={applied}
        onRemove={removeFilter}
        onClearAll={clearAll}
        search={
          <div className="w-full sm:max-w-xs">
            <Label htmlFor="topup-search" className="sr-only">
              Search payments
            </Label>
            <Input
              id="topup-search"
              type="search"
              placeholder="Search transaction ID or sender"
              defaultValue={search ?? ''}
              onChange={(event) => setSearch(event.target.value || undefined)}
            />
          </div>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="topup-status">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="topup-status" className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any status</SelectItem>
              {TOP_UP_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="topup-method">Method</Label>
          {/*
           * ⚠️ Seven options, and the three the guide never mentions are
           * among them. Offering the guide's `UPAY` would `400` on click;
           * omitting `STRIPE`, `GOOGLE_PLAY` and `APPLE_IAP` would hide rows
           * an operator has to see (plan.md O7).
           */}
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger id="topup-method" className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any method</SelectItem>
              {PAYMENT_METHODS.map((value) => (
                <SelectItem key={value} value={value}>
                  {value.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="topup-start">Submitted from</Label>
          {/*
           * ⚠️ The value is validated before it reaches the URL. The server
           * accepts `startDate=hello` and filters on it (plan.md O6), so an
           * unchecked value produces a shorter list and no error — the one
           * failure here an operator cannot see.
           */}
          <Input
            id="topup-start"
            type="date"
            value={startDate ?? ''}
            onChange={(event) => setDateRange(event.target.value || undefined, endDate)}
            className="w-full sm:w-44"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="topup-end">Submitted to</Label>
          <Input
            id="topup-end"
            type="date"
            value={endDate ?? ''}
            onChange={(event) =>
              setDateRange(startDate, event.target.value || undefined)
            }
            className="w-full sm:w-44"
          />
        </div>
      </FilterBar>

      <DataList
        rows={rows}
        columns={COLUMNS}
        rowKey={(row) => row.id}
        rowLabel={(row) =>
          row.user?.profile?.displayName ?? row.transactionId ?? row.id
        }
        loading={list.isPending}
        error={
          list.isError
            ? {
                message: isAppError(list.error)
                  ? list.error.message
                  : 'The top-up queue could not be loaded.',
              }
            : null
        }
        onRetry={() => void list.refetch()}
        onRowClick={(row) => setOpenId(row.id)}
        emptyTitle={filtered ? 'No payments match this view' : 'No top-up requests yet'}
        emptyDescription={
          filtered
            ? 'No payment was submitted under these filters. Clearing them shows the whole queue.'
            : 'Nothing is waiting for review. Requests appear here as soon as someone submits a payment from the mobile app — there is nothing to do until then.'
        }
        emptyAction={
          filtered ? (
            <Button variant="outline" onClick={clearAll}>
              Clear filters
            </Button>
          ) : undefined
        }
      />

      <TopUpDrawer request={openRequest} onClose={() => setOpenId(null)} />

      {/*
       * ⚠️ Hidden when the table is empty. The service answers `totalPages: 0`
       * for an empty table, and a pager driven straight off the response would
       * dress "nothing exists" up as "you have reached the end".
       */}
      {pagination && pagination.total > 0 ? (
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
    </div>
  )
}
