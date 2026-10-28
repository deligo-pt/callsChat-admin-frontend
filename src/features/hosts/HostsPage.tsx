import { isAppError } from '@/api/errors'
import {
  DataList,
  FilterBar,
  Pagination,
  type AdminColumn,
  type AppliedFilter,
} from '@/components/data'
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
import { LIVE_HOST_STATUSES, type LiveHost } from '@/types/hosts'

import {
  EarningsCell,
  HostActivityCell,
  HostCell,
  HostStatusCell,
  LifetimeEarningsCell,
  LiveNowCell,
  SuspensionReasonCell,
} from './cells'
import { HostStatusAction } from './HostStatusAction'
import { ANY } from './listParams'
import { useLiveHostListQuery } from './useHosts'
import { useLiveHostListParams } from './useLiveHostListParams'

/**
 * The live host roster — `/hosts` (plan.md §4.4, phase H6).
 *
 * ⚠️ **This is the governance surface, not a directory.** Everything on it
 * exists to support one decision: whether a creator may keep broadcasting.
 * Suspending one who is live ends their running room and disconnects everyone
 * watching (doc §5.2), which makes this the most destructive screen in the
 * module.
 *
 * ⚠️ **Reachable from the applications stats strip**, which links to
 * `/hosts?status=ACTIVE` and `/hosts?status=SUSPENDED`. Those two counters
 * describe the roster rather than the queue, so the tiles navigate here — and
 * `useLiveHostListParams` has to honour `?status=` or an operator arriving
 * from a tile is shown a different set from the one they clicked.
 */

const COLUMNS: readonly AdminColumn<LiveHost>[] = [
  {
    id: 'host',
    header: 'Host',
    cell: (row) => <HostCell record={row} />,
    card: 'title',
    sticky: true,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => <HostStatusCell record={row} />,
    card: 'status',
  },
  /*
   * ⚠️ **Before Activity, and that ordering is the point of phase W6.**
   * `/admin/live/hosts` has been returning the whole Creator Studio on every
   * row since H6 and the roster discarded all of it: an operator deciding
   * whether to suspend someone could see their follower count but not that
   * 12,189 withdrawable diamonds and a payout in flight were attached to the
   * same account.
   */
  {
    id: 'live',
    header: 'Live',
    cell: (row) => <LiveNowCell record={row} />,
    card: 'meta',
  },
  {
    id: 'earnings',
    header: 'Creator balance',
    cell: (row) => <EarningsCell record={row} />,
    card: 'meta',
  },
  {
    id: 'lifetime',
    header: 'Lifetime earned',
    cell: (row) => <LifetimeEarningsCell record={row} />,
    card: 'meta',
  },
  {
    id: 'activity',
    header: 'Activity',
    cell: (row) => <HostActivityCell record={row} />,
    card: 'meta',
  },
  {
    id: 'suspendedReason',
    header: 'Reason',
    cell: (row) => <SuspensionReasonCell record={row} />,
    card: 'meta',
  },
]

export function HostsPage() {
  const {
    query,
    status,
    search,
    page,
    limit,
    setStatus,
    setSearch,
    setPage,
    setLimit,
    clearAll,
    activeFilterCount,
  } = useLiveHostListParams()

  const list = useLiveHostListQuery(query)

  const rows = list.data?.data ?? []
  const pagination = list.data?.pagination
  const filtered = activeFilterCount > 0

  const applied: AppliedFilter[] = [
    ...(status !== ANY ? [{ id: 'status', label: 'Status', value: status }] : []),
    ...(search ? [{ id: 'search', label: 'Search', value: search }] : []),
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live hosts"
        description="Creators approved to broadcast. Suspending one who is live ends their stream immediately."
      />

      <FilterBar
        applied={applied}
        onRemove={(id) => (id === 'status' ? setStatus(ANY) : setSearch(undefined))}
        onClearAll={clearAll}
        search={
          <div className="w-full sm:max-w-xs">
            <Label htmlFor="roster-search" className="sr-only">
              Search hosts
            </Label>
            <Input
              id="roster-search"
              type="search"
              placeholder="Search name or username"
              defaultValue={search ?? ''}
              onChange={(event) => setSearch(event.target.value || undefined)}
            />
          </div>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="roster-status">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="roster-status" className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any status</SelectItem>
              {LIVE_HOST_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </FilterBar>

      <DataList
        rows={rows}
        columns={COLUMNS}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.user?.profile?.displayName ?? row.userId ?? row.id}
        loading={list.isPending}
        error={
          list.isError
            ? {
                message: isAppError(list.error)
                  ? list.error.message
                  : 'The host roster could not be loaded.',
              }
            : null
        }
        onRetry={() => void list.refetch()}
        rowActions={(row) => <HostStatusAction host={row} />}
        emptyTitle={filtered ? 'No hosts match this view' : 'No live hosts yet'}
        emptyDescription={
          filtered
            ? 'No host matches these filters. Clearing them shows the whole roster.'
            : 'Nobody has been approved to go live. Hosts appear here once an application is approved — there is nothing to govern until then.'
        }
        emptyAction={
          filtered ? (
            <Button variant="outline" onClick={clearAll}>
              Clear filters
            </Button>
          ) : undefined
        }
      />

      {/* Hidden on an empty roster — see `HostApplicationsPage` for why. */}
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
