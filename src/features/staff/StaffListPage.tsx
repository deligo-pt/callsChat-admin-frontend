import { Info, Plus, Search } from 'lucide-react'
import { Link, useNavigate } from 'react-router'

import { isAppError } from '@/api/errors'
import { ROUTES } from '@/app/routes'
import { DataList, FilterBar, Pagination, type AppliedFilter } from '@/components/data'
import { PageHeader } from '@/components/display'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCount } from '@/lib/format'
import { resolveStatus } from '@/lib/status'
import {
  SETTABLE_STAFF_STATUS_VALUES,
  STAFF_ROLE_VALUES,
  type StaffMember,
} from '@/types/staff'

import { partitionDeleted, type FilterKey } from './listParams'
import { staffColumns } from './staffColumns'
import { useStaffListQuery } from './useStaff'
import { useStaffListParams } from './useStaffListParams'

const FILTER_LABELS: Readonly<Record<FilterKey, string>> = {
  search: 'Search',
  role: 'Role',
  status: 'Status',
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
 * Staff directory — `/staff`. Super Admin only.
 *
 * The people who can sign in to this panel. Two things make it different from
 * the consumer user directory it otherwise resembles:
 *
 * 1. **The operator can never see their own row.** The endpoints exclude Super
 *    Admins entirely — `GET /admin/staff/:id` on one answers 404 — and the
 *    caller must be a Super Admin. So self-protection is structurally
 *    unreachable here rather than something the UI has to guard.
 * 2. **Deleted accounts stay in the list.** The backend does not filter
 *    `deletedAt` out of its reads, so a soft-deleted colleague keeps appearing
 *    with `status: INACTIVE` while every action against them answers 404
 *    (staff_management_plan.md §3.4). Hence the badge relabel, the hide
 *    toggle, and the inert rows below.
 */
export function StaffListPage() {
  const navigate = useNavigate()
  const {
    params,
    filters,
    hideDeleted,
    setFilter,
    setHideDeleted,
    setPage,
    setLimit,
    clearAll,
    activeFilterCount,
  } = useStaffListParams()

  const query = useStaffListQuery(params)

  const allRows = query.data?.data ?? []
  const pagination = query.data?.pagination

  /*
   * Filtered in the browser, because the API cannot do it: its `status` enum
   * accepts ACTIVE | SUSPENDED | BANNED | ALL and rejects INACTIVE outright.
   */
  const { visible: rows, hiddenCount } = partitionDeleted(allRows, hideDeleted)

  const appliedChips: AppliedFilter[] = Object.entries(filters).map(([key, value]) => {
    const filterKey = key as FilterKey
    let display = value

    if (filterKey === 'status') display = resolveStatus('staff', value).label
    if (filterKey === 'role') display = resolveStatus('staffRole', value).label

    return { id: filterKey, label: FILTER_LABELS[filterKey], value: display }
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff"
        description="The people who can sign in to this admin panel, and which modules each of them can reach."
        breadcrumbs={[{ label: 'Staff' }]}
        actions={
          <Button asChild>
            <Link to={ROUTES.staffNew}>
              <Plus aria-hidden="true" />
              Add staff
            </Link>
          </Button>
        }
        toolbar={
          <FilterBar
            applied={appliedChips}
            onRemove={(id) => setFilter(id as FilterKey, undefined)}
            onClearAll={clearAll}
            search={
              <div className="space-y-1.5">
                <Label
                  htmlFor="staff-search"
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
                    id="staff-search"
                    type="search"
                    className="pl-9"
                    placeholder="Name, username or email"
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
              id="filter-staff-role"
              label="Role"
              value={filters.role}
              onChange={(value) => setFilter('role', value)}
            >
              <SelectItem value="all">All roles</SelectItem>
              {STAFF_ROLE_VALUES.map((role) => (
                <SelectItem key={role} value={role}>
                  {resolveStatus('staffRole', role).label}
                </SelectItem>
              ))}
            </FilterSelect>

            <FilterSelect
              id="filter-staff-status"
              label="Status"
              value={filters.status}
              /*
               * Only the three SETTABLE statuses. `INACTIVE` is deliberately
               * absent because the API's filter enum rejects it — offering it
               * would 400 the whole page.
               */
              onChange={(value) => setFilter('status', value)}
            >
              <SelectItem value="all">All statuses</SelectItem>
              {SETTABLE_STAFF_STATUS_VALUES.map((status) => (
                <SelectItem key={status} value={status}>
                  {resolveStatus('staff', status).label}
                </SelectItem>
              ))}
            </FilterSelect>

            {/*
             * Not a `FilterSelect`, and not a chip: this is a view preference
             * applied in the browser, not a filter the server was asked for.
             * Presenting it as one would imply the count below it came back
             * filtered, which it did not.
             */}
            <div className="space-y-1.5">
              <span className="block text-caption text-foreground-muted">
                Deleted accounts
              </span>
              <label className="flex items-center gap-2 text-body">
                <Checkbox
                  checked={hideDeleted}
                  onCheckedChange={(checked) => setHideDeleted(checked === true)}
                />
                Hide deleted
              </label>
            </div>
          </FilterBar>
        }
      />

      {/*
       * Two things the operator cannot discover from the table itself, stated
       * once rather than left to be inferred:
       *
       * - the order is fixed, because `sortBy` is accepted and ignored
       * - a deleted account is still here, because the backend does not
       *   filter it out — so the list's own total will exceed what is shown
       */}
      <p className="flex items-start gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-caption text-foreground-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Sorted by date added, newest first — this list cannot be re-sorted.
          {hiddenCount > 0 ? (
            <>
              {' '}
              <span className="font-medium text-foreground">
                {hiddenCount} deleted{' '}
                {hiddenCount === 1 ? 'account is' : 'accounts are'} hidden.
              </span>{' '}
              Deleted accounts stay in the directory so past actions remain
              attributable; clear the checkbox to see them.
            </>
          ) : null}
        </span>
      </p>

      <DataList<StaffMember>
        rows={rows}
        columns={staffColumns}
        rowKey={(member) => member.id}
        // Names each card's open control, e.g. "View Sarah Connor".
        rowLabel={(member) => member.displayName}
        loading={query.isPending}
        error={
          query.isError
            ? {
                message: isAppError(query.error)
                  ? query.error.message
                  : 'The staff directory could not be loaded.',
                ...(isAppError(query.error) && query.error.correlationId
                  ? { correlationId: query.error.correlationId }
                  : {}),
              }
            : null
        }
        onRetry={() => void query.refetch()}
        /*
         * A deleted row does not navigate. Its detail page could only offer
         * actions the API answers 404 to, so the badge is the whole story and
         * opening it would be a dead end.
         */
        onRowClick={(member: StaffMember) => {
          if (member.status === 'INACTIVE') return
          void navigate(ROUTES.staffMember(member.id))
        }}
        emptyTitle={
          activeFilterCount > 0 || hiddenCount > 0
            ? 'No staff members match this view'
            : 'No staff members yet'
        }
        emptyDescription={
          hiddenCount > 0 && activeFilterCount === 0
            ? `Every account on this page is deleted. Clear "Hide deleted" to see ${
                hiddenCount === 1 ? 'it' : 'them'
              }.`
            : activeFilterCount > 0
              ? 'Try widening the search or clearing a filter.'
              : 'Admins and moderators you add will appear here.'
        }
        /*
         * Offered only on a genuinely empty directory. Beside "no rows match
         * this filter", a create button answers a question nobody asked and
         * competes with the one action that would help — clearing the filter.
         */
        emptyAction={
          activeFilterCount === 0 && hiddenCount === 0 ? (
            <Button asChild>
              <Link to={ROUTES.staffNew}>
                <Plus aria-hidden="true" />
                Add staff
              </Link>
            </Button>
          ) : null
        }
      />

      {pagination && pagination.total > 0 ? (
        <Pagination
          state={{
            page: pagination.page,
            pageSize: pagination.limit,
            total: pagination.total,
            totalPages: pagination.totalPages,
          }}
          onPageChange={setPage}
          onPageSizeChange={setLimit}
        />
      ) : null}

      {pagination ? (
        <p className="sr-only" role="status">
          {formatCount(pagination.total)} staff members found
          {hiddenCount > 0 ? `, ${formatCount(hiddenCount)} deleted and hidden` : ''}.
        </p>
      ) : null}
    </div>
  )
}
