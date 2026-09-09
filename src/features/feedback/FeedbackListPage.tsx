import { Info, Search } from 'lucide-react'
import { useNavigate } from 'react-router'

import { isAppError } from '@/api/errors'
import { ROUTES } from '@/app/routes'
import {
  DataList,
  DateRangePicker,
  FilterBar,
  Pagination,
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
import { formatDate } from '@/lib/datetime'
import { formatCount } from '@/lib/format'
import { resolveStatus } from '@/lib/status'
import {
  FEEDBACK_PRIORITY_VALUES,
  FEEDBACK_STATUS_VALUES,
  type Feedback,
} from '@/types/feedback'

import { feedbackColumns } from './feedbackColumns'
import { FEEDBACK_TYPES } from './labels'
import type { FilterKey } from './listParams'
import { StatsStrip } from './StatsStrip'
import { useFeedbackListQuery, useFeedbackStatsQuery } from './useFeedback'
import { useFeedbackListParams } from './useFeedbackListParams'

const FILTER_LABELS: Readonly<Record<FilterKey, string>> = {
  search: 'Search',
  status: 'Status',
  type: 'Type',
  priority: 'Priority',
}

/** A labelled select that reads and writes one URL-backed filter. */
function FilterSelect({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string
  label: string
  value: string | undefined
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-caption text-foreground-muted">
        {label}
      </Label>
      <Select value={value ?? 'all'} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full lg:w-[11rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  )
}

/**
 * The support queue — `/feedback`. Super Admin only
 * (feedback_management_plan.md §5.1).
 *
 * What users are reporting, in the order an inbox is worked: most urgent
 * first. Three things make it different from the other lists in the panel.
 *
 * 1. **The stats strip is not the list's count.** It comes from a second
 *    route that takes no filters, so it always describes every ticket in the
 *    system. It is labelled "All tickets" and never re-labelled to match the
 *    filters (§5.1).
 * 2. **Sorting is real here.** Unlike the staff directory, `sortBy` is
 *    validated and honoured, so four columns carry live sort controls (§2.4).
 * 3. **There is no "Unassigned" filter**, though the column shows the state.
 *    `assignedAdminId=null` is compared as a literal string and matches
 *    nothing (§3.6), so the control is absent rather than dishonest — the same
 *    rule `features/users/listParams.ts` applies to its four dead filters.
 *
 * No primary action: there is no admin submit endpoint, and a "New ticket"
 * button would file a report as the acting Super Admin against themselves
 * (§1.2).
 */
export function FeedbackListPage() {
  const navigate = useNavigate()
  const {
    params,
    filters,
    dateRange,
    setFilter,
    setDateRange,
    setPage,
    setLimit,
    setSort,
    clearAll,
    activeFilterCount,
  } = useFeedbackListParams()

  const query = useFeedbackListQuery(params)
  const stats = useFeedbackStatsQuery()

  const rows = query.data?.items ?? []
  const meta = query.data?.meta

  /*
   * An out-of-range page, which this endpoint does not clamp (§3.8). Derived
   * from the rows rather than from `meta.totalPages`, which claims `1` even on
   * an empty result and so cannot be compared against anything.
   */
  const pastTheEnd = !query.isPending && rows.length === 0 && (meta?.page ?? 1) > 1

  const appliedChips: AppliedFilter[] = Object.entries(filters).map(([key, value]) => {
    const filterKey = key as FilterKey
    let display = value

    if (filterKey === 'status') display = resolveStatus('feedback', value).label
    if (filterKey === 'priority')
      display = resolveStatus('feedbackPriority', value).label
    if (filterKey === 'type') {
      display = FEEDBACK_TYPES.find((entry) => entry.value === value)?.label ?? value
    }

    return { id: filterKey, label: FILTER_LABELS[filterKey], value: display }
  })

  /*
   * One chip for the range, not two. It is one control, and two independently
   * removable chips would let an operator clear half a range through a picker
   * that cannot express the result.
   */
  if (dateRange?.from || dateRange?.to) {
    appliedChips.push({
      id: 'dateRange',
      label: 'Filed',
      value: `${dateRange.from ? formatDate(dateRange.from) : '…'} – ${
        dateRange.to ? formatDate(dateRange.to) : '…'
      }`,
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feedback"
        description="What users are reporting from the app — bugs, suggestions, and reports about other members."
        breadcrumbs={[{ label: 'Feedback' }]}
        toolbar={
          <FilterBar
            applied={appliedChips}
            onRemove={(id) => {
              if (id === 'dateRange') setDateRange(undefined)
              else setFilter(id as FilterKey, undefined)
            }}
            onClearAll={clearAll}
            search={
              <div className="space-y-1.5">
                <Label
                  htmlFor="feedback-search"
                  className="text-caption text-foreground-muted"
                >
                  Search
                </Label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground-subtle"
                    aria-hidden="true"
                  />
                  <Input
                    id="feedback-search"
                    type="search"
                    className="pl-9"
                    placeholder="Subject, description or reporter email"
                    defaultValue={filters.search ?? ''}
                    /*
                     * Committed on Enter or blur, not per keystroke — the URL
                     * is the state store, and a history entry plus a request
                     * per character would be noisy and slow.
                     */
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        setFilter('search', event.currentTarget.value.trim())
                      }
                    }}
                    onBlur={(event) =>
                      setFilter('search', event.currentTarget.value.trim())
                    }
                  />
                </div>
              </div>
            }
          >
            <FilterSelect
              id="filter-feedback-status"
              label="Status"
              value={filters.status}
              onChange={(value) => setFilter('status', value)}
            >
              <SelectItem value="all">All statuses</SelectItem>
              {FEEDBACK_STATUS_VALUES.map((status) => (
                <SelectItem key={status} value={status}>
                  {resolveStatus('feedback', status).label}
                </SelectItem>
              ))}
            </FilterSelect>

            <FilterSelect
              id="filter-feedback-type"
              label="Type"
              value={filters.type}
              onChange={(value) => setFilter('type', value)}
            >
              <SelectItem value="all">All types</SelectItem>
              {FEEDBACK_TYPES.map((entry) => (
                <SelectItem key={entry.value} value={entry.value}>
                  {/*
                   * The description is on screen, not in a tooltip: `REPORT`
                   * means "report another user", not "report a problem", and
                   * an operator filtering a support queue reads it as the
                   * latter every time.
                   */}
                  <span className="flex flex-col gap-0.5">
                    <span>{entry.label}</span>
                    <span className="text-caption text-foreground-muted">
                      {entry.description}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </FilterSelect>

            <FilterSelect
              id="filter-feedback-priority"
              label="Priority"
              value={filters.priority}
              onChange={(value) => setFilter('priority', value)}
            >
              <SelectItem value="all">All priorities</SelectItem>
              {FEEDBACK_PRIORITY_VALUES.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {resolveStatus('feedbackPriority', priority).label}
                </SelectItem>
              ))}
            </FilterSelect>

            {/*
             * The only control in the panel whose value is re-validated on the
             * way out. `fromDate=notadate` answers 200 with the filter
             * silently dropped (§3.7), so `useFeedbackListParams` refuses to
             * put anything but a real calendar day in the URL — the picker
             * cannot produce one, but a pasted link can.
             */}
            <DateRangePicker
              label="Filed"
              value={dateRange}
              onChange={setDateRange}
              className="min-w-0"
            />
          </FilterBar>
        }
      />

      <StatsStrip
        stats={stats.data}
        loading={stats.isPending}
        activeStatus={filters.status}
        onSelectStatus={(status) => setFilter('status', status)}
      />

      {/*
       * Stated once rather than left to be inferred from a column that shows
       * the gap but cannot be filtered on.
       */}
      <p className="flex items-start gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-caption text-foreground-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Sorted by priority, most urgent first — use the column headers to re-sort.
          Unassigned tickets are marked in the Assignee column, but cannot be filtered
          for: the API has no value that means unassigned.
        </span>
      </p>

      <DataList<Feedback>
        rows={rows}
        columns={feedbackColumns}
        rowKey={(ticket) => ticket.id}
        // Names each card's open control, e.g. "View Cannot join a room".
        rowLabel={(ticket) => ticket.subject}
        loading={query.isPending}
        error={
          query.isError
            ? {
                message: isAppError(query.error)
                  ? query.error.message
                  : 'The feedback queue could not be loaded.',
                ...(isAppError(query.error) && query.error.correlationId
                  ? { correlationId: query.error.correlationId }
                  : {}),
              }
            : null
        }
        onRetry={() => void query.refetch()}
        sort={{
          field: params.sortBy ?? 'priority',
          direction: params.sortOrder ?? 'desc',
        }}
        onSortChange={(sort) => setSort(sort.field, sort.direction)}
        onRowClick={(ticket: Feedback) => {
          void navigate(ROUTES.feedbackTicket(ticket.id))
        }}
        /*
         * ⚠️ Three empty states, not two, and the third is the §3.8
         * mitigation doing something useful rather than merely not crashing.
         * `?page=99` answers 200 with `items: []` and `meta.page: 99` — the
         * request echoed back — so an operator following a stale link lands on
         * a blank page with, without this, copy telling them to clear filters
         * they have not set.
         */
        emptyTitle={
          pastTheEnd
            ? 'There is no page here'
            : activeFilterCount > 0
              ? 'No tickets match this view'
              : 'No feedback yet'
        }
        emptyDescription={
          pastTheEnd
            ? `This view has ${formatCount(meta?.totalPages ?? 1)} ${
                (meta?.totalPages ?? 1) === 1 ? 'page' : 'pages'
              }. Go back to the first one to see the queue.`
            : activeFilterCount > 0
              ? 'Try widening the search, clearing a filter, or checking the date range.'
              : 'Reports and suggestions users file from the app will appear here.'
        }
        emptyAction={
          pastTheEnd ? (
            <Button variant="outline" onClick={() => setPage(1)}>
              Back to the first page
            </Button>
          ) : null
        }
      />

      {/*
       * ⚠️ Driven by `rows.length`, never by `meta.totalPages` — an empty
       * result comes back claiming `totalPages: 1`, and `?page=99` is echoed
       * back rather than clamped (§3.8). `Pagination` does the clamping; this
       * condition only decides whether there is anything to page through.
       */}
      {meta && meta.total > 0 ? (
        <Pagination
          state={{
            page: meta.page,
            pageSize: meta.limit,
            total: meta.total,
            totalPages: meta.totalPages,
          }}
          onPageChange={setPage}
          onPageSizeChange={setLimit}
        />
      ) : null}

      {meta ? (
        <p className="sr-only" role="status">
          {formatCount(meta.total)} feedback tickets found.
        </p>
      ) : null}
    </div>
  )
}
