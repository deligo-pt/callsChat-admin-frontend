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
import { DetailTabs, PageHeader } from '@/components/display'
import { Button } from '@/components/ui/button'
import { useUserName } from '@/components/wallet'
import { formatDate } from '@/lib/datetime'
import { formatCount } from '@/lib/format'
import { useIsTableViewport } from '@/lib/hooks/useBreakpoint'
import { hostName, type LiveRoom } from '@/types/liveRooms'

import {
  DurationCell,
  HostCell,
  LIVE_TIME_ZONE,
  ModActionsCell,
  RoomStatusCell,
  StageCell,
  StartedCell,
  StreamCell,
  ViewersCell,
} from './cells'
import { SORT_LABELS, TOPIC_LABELS, TYPE_LABELS } from './labels'
import { LiveKpiStrip } from './LiveKpiStrip'
import { StaleSweepAction } from './StaleSweepAction'
import { LiveSearch, LiveStreamFilters } from './LiveStreamFilters'
import {
  useLiveAnalytics,
  useLiveHistoryQuery,
  useLiveRoomsQuery,
} from './useLiveRooms'
import {
  useLiveStreamParams,
  type LiveFilterKey,
  type LiveTab,
} from './useLiveStreamParams'

/**
 * Live streams — `/live-streams` (plan.md Live §5.1, phase L1).
 *
 * Two tabs over two routes: **Live now** (`GET /admin/live/rooms`, polled
 * every 10 s) and **Past streams** (`GET /admin/live/rooms/history`). Each
 * offers only the filters its route reads (plan.md L-B4), and every filter
 * round-trips through the URL.
 *
 * A row opens the room page (L2), carrying this view's query so "back" there
 * returns to it.
 *
 * ⚠️ On staging nobody is live (plan.md L-B6), so "No one is live right now"
 * is the state an operator will see most — it points at Past streams.
 */

const COLUMNS: readonly AdminColumn<LiveRoom>[] = [
  {
    id: 'stream',
    header: 'Stream',
    cell: (row) => <StreamCell row={row} />,
    card: 'title',
  },
  { id: 'host', header: 'Host', cell: (row) => <HostCell row={row} />, card: 'meta' },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => <RoomStatusCell row={row} />,
    card: 'status',
  },
  {
    id: 'started',
    header: 'Started',
    cell: (row) => <StartedCell row={row} />,
    card: 'meta',
  },
  {
    id: 'duration',
    header: 'Duration',
    cell: (row) => <DurationCell row={row} />,
    card: 'meta',
  },
  {
    id: 'viewers',
    header: 'Viewers',
    cell: (row) => <ViewersCell row={row} />,
    card: 'meta',
  },
  {
    id: 'stage',
    header: 'On stage',
    cell: (row) => <StageCell row={row} />,
    card: 'meta',
  },
  {
    id: 'modActions',
    header: 'Mod actions',
    cell: (row) => <ModActionsCell row={row} />,
    card: 'meta',
  },
]

const FILTER_LABELS: Record<LiveFilterKey, string> = {
  search: 'Search',
  hostId: 'Host',
  status: 'Status',
  topic: 'Topic',
  type: 'Type',
  fromDate: 'From',
  toDate: 'To',
}

function dayLabel(day: string): string {
  return formatDate(`${day}T00:00:00+06:00`, { timeZone: LIVE_TIME_ZONE })
}

/**
 * The host's name for the Host chip: from the rows (filtered by `hostId`,
 * every row is theirs), else their record, else plain words — never the id.
 */
function hostChipName(
  rows: readonly LiveRoom[],
  id: string,
  looked: string | null | undefined,
): string {
  const first = rows[0]
  if (first && (first.hostId ?? first.host.id) === id) return hostName(first.host)
  return looked?.trim() || 'This host'
}

export function LiveStreamsPage() {
  const {
    tab,
    filters,
    sort,
    page,
    limit,
    liveQuery,
    historyQuery,
    setTab,
    setFilter,
    setDateRange,
    setSort,
    setPage,
    setLimit,
    clearAll,
    activeFilterCount,
  } = useLiveStreamParams()
  const isDesktop = useIsTableViewport()
  const navigate = useNavigate()
  const location = useLocation()

  const analytics = useLiveAnalytics()
  const liveList = useLiveRoomsQuery(liveQuery, tab === 'live')
  const historyList = useLiveHistoryQuery(historyQuery, tab === 'past')
  const list = tab === 'live' ? liveList : historyList

  const rows = list.data?.data ?? []
  const pagination = list.data?.pagination
  const filtered = activeFilterCount > 0
  const pastEnd = !list.isPending && rows.length === 0 && (pagination?.total ?? 0) > 0

  const canReadUsers = useCan(PERMISSIONS.usersView)
  const canModerate = useCan(PERMISSIONS.liveModerate)
  const hostLookup = useUserName(
    filters.hostId ?? '',
    canReadUsers && !list.isPending && rows.length === 0 && Boolean(filters.hostId),
  )

  const applied: AppliedFilter[] = [
    ...(Object.entries(filters) as [LiveFilterKey, string][]).map(([key, value]) => {
      let display = value
      if (key === 'topic') display = TOPIC_LABELS[value as keyof typeof TOPIC_LABELS]
      if (key === 'type') display = TYPE_LABELS[value as keyof typeof TYPE_LABELS]
      if (key === 'status') display = 'Paused'
      if (key === 'fromDate' || key === 'toDate') display = dayLabel(value)
      if (key === 'hostId')
        display = hostChipName(rows, value, hostLookup.data?.displayName)
      return { id: key, label: FILTER_LABELS[key], value: display }
    }),
    ...(tab === 'live' && sort !== 'recent'
      ? [{ id: 'sort', label: 'Order', value: SORT_LABELS[sort] }]
      : []),
  ]

  const noun = tab === 'live' ? 'streams on air' : 'past streams'

  const body = (
    <div className="space-y-4">
      <FilterBar
        applied={applied}
        onRemove={(id) => {
          if (id === 'sort') setSort('recent')
          else if (id === 'fromDate') setDateRange(undefined, filters.toDate)
          else if (id === 'toDate') setDateRange(filters.fromDate, undefined)
          else setFilter(id as LiveFilterKey, undefined)
        }}
        onClearAll={clearAll}
        {...(isDesktop
          ? {}
          : {
              search: (
                <LiveSearch
                  value={filters.search}
                  onCommit={(value) => setFilter('search', value)}
                  hideLabel
                />
              ),
            })}
      >
        <LiveStreamFilters
          tab={tab}
          filters={filters}
          sort={sort}
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
        rowLabel={(row) => row.title.trim() || 'Untitled stream'}
        onRowClick={(row) =>
          void navigate(ROUTES.liveStream(row.id), { state: { from: location.search } })
        }
        loading={list.isPending}
        error={
          list.isError
            ? {
                message: isAppError(list.error)
                  ? list.error.message
                  : 'The streams could not be loaded.',
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
              ? 'No streams match this view'
              : tab === 'live'
                ? 'No one is live right now'
                : 'No streams have ended yet'
        }
        emptyDescription={
          pastEnd
            ? `There are ${formatCount(pagination?.total ?? 0)} ${noun} in this view, all on earlier pages.`
            : filtered
              ? 'Nothing matches these filters. Clearing them shows every stream.'
              : tab === 'live'
                ? 'Rooms appear here the moment a host goes live, and this list refreshes every 10 seconds.'
                : 'Streams appear here once they end.'
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
          ) : tab === 'live' ? (
            <Button variant="outline" onClick={() => setTab('past')}>
              See past streams
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
        title="Live streams"
        description="Rooms on air now and every stream that has ended. Times are Bangladesh time (GMT+6)."
        {...(canModerate ? { actions: <StaleSweepAction /> } : {})}
      />

      <LiveKpiStrip
        analytics={analytics.data}
        loading={analytics.isPending}
        failed={analytics.isError}
      />

      <DetailTabs
        value={tab}
        onValueChange={(value) => setTab(value as LiveTab)}
        tabs={[
          {
            value: 'live',
            label: 'Live now',
            ...(analytics.data ? { count: analytics.data.activeRoomsTotal } : {}),
            content: tab === 'live' ? body : null,
          },
          {
            value: 'past',
            label: 'Past streams',
            content: tab === 'past' ? body : null,
          },
        ]}
      />
    </div>
  )
}
