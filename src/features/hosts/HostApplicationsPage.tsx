import { useState } from 'react'

import { DataList, FilterBar, Pagination, type AppliedFilter } from '@/components/data'
import { PageHeader } from '@/components/display'
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
import type { AdminColumn } from '@/components/data'
import { isAppError } from '@/api/errors'
import {
  HOST_APPLICATION_STATUSES,
  HOST_NICHES,
  type HostApplication,
} from '@/types/hosts'

import { ApplicationDrawer } from './ApplicationDrawer'
import { ApplicantCell, NicheCell, StatusCell, SubmittedCell } from './cells'
import { ANY } from './listParams'
import { StatsStrip } from './StatsStrip'
import { useHostApplicationStatsFallback } from './statsFallback'
import { useHostApplicationListParams } from './useHostApplicationListParams'
import { useHostApplicationListQuery, useHostApplicationStatsQuery } from './useHosts'

/**
 * The host-applications queue — `/host-applications` (plan.md §4.4, phase H4).
 *
 * ⚠️ **The empty state is this screen's main path, not its edge case.** The
 * live service holds zero applications and every counter is zero (plan.md
 * §2.1), so "nothing at all" is what an operator actually sees today. It is
 * built and worded first, and kept distinct from the two states it would
 * otherwise be confused with:
 *
 *   - **nothing at all** — the queue is genuinely empty; nothing is wrong, and
 *     the copy must not suggest the operator should change something;
 *   - **nothing matches** — filters are narrowing a non-empty table, so the
 *     way out is to clear them, and the action says exactly that;
 *   - **the request failed** — `DataList` renders its own error state with a
 *     retry; this page never flattens a failure into "no results", which would
 *     tell an operator the queue is empty when it is unknown.
 */

const COLUMNS: readonly AdminColumn<HostApplication>[] = [
  {
    id: 'applicant',
    header: 'Applicant',
    cell: (row) => <ApplicantCell record={row} />,
    card: 'title',
    sticky: true,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => <StatusCell record={row} />,
    card: 'status',
  },
  {
    id: 'niche',
    header: 'Category',
    cell: (row) => <NicheCell record={row} />,
    card: 'meta',
  },
  {
    id: 'createdAt',
    header: 'Submitted',
    cell: (row) => <SubmittedCell record={row} />,
    card: 'meta',
  },
]

export function HostApplicationsPage() {
  /*
   * ⚠️ Drawer state, not a route.
   *
   * `ROUTES.hostApplication(id)` exists and is unused: the doc asks for a
   * drawer (§3 Screen 3), and a reviewer's job is to move through a queue
   * rather than to deep-link one record. Keeping the list mounted behind it is
   * what makes "approve, close, next" possible without a refetch between every
   * decision. The route stays declared so this can be reconsidered without a
   * migration.
   */
  const [openId, setOpenId] = useState<string | null>(null)

  const {
    query,
    status,
    niche,
    search,
    startDate,
    endDate,
    page,
    limit,
    setStatus,
    setNiche,
    setSearch,
    setDateRange,
    setPage,
    setLimit,
    clearAll,
    activeFilterCount,
  } = useHostApplicationListParams()

  const list = useHostApplicationListQuery(query)
  const stats = useHostApplicationStatsQuery()

  /*
   * ⚠️ **The counters' route is a `404` on the live backend** (plan.md O1,
   * phase W0). `useHostApplicationStatsFallback` rebuilds the same six numbers
   * from `pagination.total` on the list routes, and runs **only** while the
   * real endpoint is failing — so a healthy backend costs nothing, and the day
   * the route is fixed this line goes quiet on its own.
   */
  const fallback = useHostApplicationStatsFallback(stats.isError)
  const counters = stats.data ?? fallback.stats
  const countersPending = stats.isPending || fallback.isPending

  const rows = list.data?.data ?? []
  const pagination = list.data?.pagination

  const applied: AppliedFilter[] = [
    ...(status !== ANY ? [{ id: 'status', label: 'Status', value: status }] : []),
    ...(niche !== ANY ? [{ id: 'niche', label: 'Category', value: niche }] : []),
    ...(search ? [{ id: 'search', label: 'Search', value: search }] : []),
    ...(startDate ? [{ id: 'startDate', label: 'From', value: startDate }] : []),
    ...(endDate ? [{ id: 'endDate', label: 'To', value: endDate }] : []),
  ]

  function removeFilter(id: string) {
    if (id === 'status') setStatus(ANY)
    else if (id === 'niche') setNiche(ANY)
    else if (id === 'search') setSearch(undefined)
    else if (id === 'startDate') setDateRange(undefined, endDate)
    else if (id === 'endDate') setDateRange(startDate, undefined)
  }

  /*
   * ⚠️ The three remote states, kept apart on purpose — see the file note.
   * `filtered` is what decides between "nothing here" and "nothing matches",
   * and it reads the filter count rather than the row count, because an empty
   * result with filters applied means something different from an empty result
   * without them.
   */
  const filtered = activeFilterCount > 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Host applications"
        description="Creators asking to go live. Approving one activates their host profile immediately."
      />

      <StatsStrip
        stats={counters}
        loading={countersPending}
        activeStatus={status}
        onSelectStatus={setStatus}
      />

      <FilterBar
        applied={applied}
        onRemove={removeFilter}
        onClearAll={clearAll}
        search={
          <div className="w-full sm:max-w-xs">
            <Label htmlFor="host-search" className="sr-only">
              Search applicants
            </Label>
            <Input
              id="host-search"
              type="search"
              placeholder="Search name or username"
              defaultValue={search ?? ''}
              onChange={(event) => setSearch(event.target.value || undefined)}
            />
          </div>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="host-status">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="host-status" className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any status</SelectItem>
              {HOST_APPLICATION_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="host-niche">Category</Label>
          {/*
           * ⚠️ A closed select, never a free-text field.
           *
           * The server does NOT validate `niche` (plan.md §3.2): a typo
           * answers 200 and returns the wrong set rather than an error. Every
           * other facet on this bar is protected by the server rejecting bad
           * input; this one is protected only by the control.
           */}
          <Select value={niche} onValueChange={setNiche}>
            <SelectTrigger id="host-niche" className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any category</SelectItem>
              {HOST_NICHES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="host-start">Submitted from</Label>
          <Input
            id="host-start"
            type="date"
            value={startDate ?? ''}
            onChange={(event) => setDateRange(event.target.value || undefined, endDate)}
            className="w-full sm:w-44"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="host-end">Submitted to</Label>
          <Input
            id="host-end"
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
          row.user?.profile?.displayName ?? row.user?.profile?.username ?? row.id
        }
        loading={list.isPending}
        error={
          list.isError
            ? {
                message: isAppError(list.error)
                  ? list.error.message
                  : 'The applications queue could not be loaded.',
              }
            : null
        }
        onRetry={() => void list.refetch()}
        onRowClick={(row) => setOpenId(row.id)}
        emptyTitle={
          filtered ? 'No applications match this view' : 'No applications yet'
        }
        emptyDescription={
          filtered
            ? 'No creator has applied under these filters. Clearing them shows the whole queue.'
            : 'Nothing has been submitted. Applications appear here as soon as a creator applies from the mobile app — there is nothing to do until then.'
        }
        emptyAction={
          filtered ? (
            <Button variant="outline" onClick={clearAll}>
              Clear filters
            </Button>
          ) : undefined
        }
      />

      <ApplicationDrawer applicationId={openId} onClose={() => setOpenId(null)} />

      {/*
       * ⚠️ Hidden when the table is empty, which on this backend is always.
       *
       * The service answers `totalPages: 1` for a table holding zero rows
       * (verified — plan.md §2.1), so a pager driven straight off the response
       * would render "Page 1 of 1" under an empty-state illustration. That is
       * not wrong exactly, but it dresses "nothing exists" up as "you have
       * reached the end", which is a different statement.
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
