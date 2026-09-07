import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Info, Search } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { isAppError } from '@/api/errors'
import { queryKeys } from '@/api/queryKeys'
import { ROUTES } from '@/app/routes'
import { PERMISSIONS } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import {
  DataList,
  ExportButton,
  FilterBar,
  Pagination,
  type AppliedFilter,
} from '@/components/data'
import { PageHeader } from '@/components/display'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'

import { formatCount } from '@/lib/format'
import { resolveStatus } from '@/lib/status'
import {
  accountStatusSchema,
  accountTypeSchema,
  userRoleSchema,
  type UserSummary,
} from '@/types/identity'

import { exportUsers, fetchUsers } from './api'
import { CreateUserAction } from './CreateUserAction'
import { UNSUPPORTED_FILTERS } from './listParams'
import { useUserListParams, type FilterKey } from './useUserListParams'
import { userColumns } from './userColumns'

const STATUS_OPTIONS = accountStatusSchema.options
const ROLE_OPTIONS = userRoleSchema.options
const ACCOUNT_TYPE_OPTIONS = accountTypeSchema.options

const RESTRICTION_OPTIONS = [
  { value: 'true', label: 'Has restrictions' },
  { value: 'false', label: 'No restrictions' },
] as const

const FILTER_LABELS: Readonly<Record<FilterKey, string>> = {
  search: 'Search',
  status: 'Status',
  role: 'Role',
  accountType: 'Type',
  hasRestrictions: 'Restrictions',
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
        {/* Full width in the mobile filter sheet, fixed on desktop. */}
        <SelectTrigger id={id} className="w-full lg:w-[11rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  )
}

/**
 * User directory — `/users`.
 *
 * plan.md Phase 3A. Every data operation is server-driven: the browser never
 * sorts, filters or paginates a set it holds. `DataList` renders the table at
 * `lg` and cards below it from one column definition, and `FilterBar` moves
 * the controls into a bottom sheet on mobile.
 */
export function UsersListPage() {
  const navigate = useNavigate()
  const { can } = useAuth()
  const [exporting, setExporting] = useState(false)
  const {
    params,
    filters,
    setFilter,
    setPage,
    setLimit,
    setSort,
    clearAll,
    activeFilterCount,
  } = useUserListParams()

  const query = useQuery({
    queryKey: queryKeys.users.list(params),
    queryFn: ({ signal }) => fetchUsers(params, signal),
    /*
     * Keep the previous page visible while the next one loads. Without this,
     * paging or changing a filter blanks the table to a skeleton on every
     * keystroke, which reads as a broken page rather than a loading one.
     */
    placeholderData: keepPreviousData,
  })

  const rows = query.data?.data ?? []
  const pagination = query.data?.pagination

  /*
   * The export honours the live filters, so the confirmation has to say WHICH
   * filters — "export 22 users" reads very differently from "export all 22,000".
   */
  const exportScope =
    activeFilterCount === 0
      ? 'All users, unfiltered'
      : `Users matching the ${activeFilterCount} active filter${
          activeFilterCount === 1 ? '' : 's'
        }`

  const appliedChips: AppliedFilter[] = Object.entries(filters).map(([key, value]) => {
    const filterKey = key as FilterKey
    let display = value

    if (filterKey === 'status') display = resolveStatus('user', value).label
    if (filterKey === 'accountType') display = resolveStatus('accountType', value).label
    if (filterKey === 'hasRestrictions')
      display = value === 'true' ? 'Has restrictions' : 'None'

    return { id: filterKey, label: FILTER_LABELS[filterKey], value: display }
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Every registered CallsChat account. Select a record to review status, restrictions, sessions and history."
        breadcrumbs={[{ label: 'Users' }]}
        actions={
          <>
            {can(PERMISSIONS.usersCreate) ? <CreateUserAction /> : null}
            <ExportButton
              canExport={can(PERMISSIONS.exportData)}
              rowCount={pagination?.total ?? 0}
              resource="users"
              scopeDescription={exportScope}
              loading={exporting}
              onExport={() => {
                setExporting(true)
                exportUsers(params)
                  .then(() => toast.success('Export downloaded.'))
                  .catch((error: unknown) =>
                    toast.error(
                      isAppError(error)
                        ? error.message
                        : 'The export could not be downloaded.',
                    ),
                  )
                  .finally(() => setExporting(false))
              }}
            />
          </>
        }
        toolbar={
          <FilterBar
            applied={appliedChips}
            onRemove={(id) => setFilter(id as FilterKey, undefined)}
            onClearAll={clearAll}
            search={
              <div className="space-y-1.5">
                <Label
                  htmlFor="user-search"
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
                    id="user-search"
                    type="search"
                    className="pl-9"
                    placeholder="Name, username or user ID"
                    defaultValue={filters.search ?? ''}
                    /*
                     * Committed on Enter or blur rather than per keystroke.
                     * The URL is the state store here, and writing a history
                     * entry and a request for every character would be both
                     * noisy and slow.
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
              id="filter-status"
              label="Status"
              value={filters.status}
              onChange={(value) => setFilter('status', value)}
            >
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {resolveStatus('user', status).label}
                </SelectItem>
              ))}
            </FilterSelect>

            <FilterSelect
              id="filter-restrictions"
              label="Restrictions"
              value={filters.hasRestrictions}
              onChange={(value) => setFilter('hasRestrictions', value)}
            >
              <SelectItem value="all">Any</SelectItem>
              {RESTRICTION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </FilterSelect>

            <FilterSelect
              id="filter-type"
              label="Account type"
              value={filters.accountType}
              onChange={(value) => setFilter('accountType', value)}
            >
              <SelectItem value="all">All types</SelectItem>
              {ACCOUNT_TYPE_OPTIONS.map((type) => (
                <SelectItem key={type} value={type}>
                  {resolveStatus('accountType', type).label}
                </SelectItem>
              ))}
            </FilterSelect>

            <FilterSelect
              id="filter-role"
              label="Role"
              value={filters.role}
              onChange={(value) => setFilter('role', value)}
            >
              <SelectItem value="all">All roles</SelectItem>
              {ROLE_OPTIONS.map((role) => (
                <SelectItem key={role} value={role}>
                  {resolveStatus('user', role).label}
                </SelectItem>
              ))}
            </FilterSelect>
          </FilterBar>
        }
      />

      {/*
       * plan.md §10.4 / 3A′ #2: four filters the module spec calls for are not
       * implemented server-side, and the API returns 200 for them rather than
       * an error — so wiring up the controls would silently show unfiltered
       * results. Saying so is the honest option; a control that lies is worse
       * than a missing one.
       */}
      <p className="flex items-start gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-caption text-foreground-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-medium text-foreground">
            Some filters are not available yet.
          </span>{' '}
          {UNSUPPORTED_FILTERS.map((filter) => filter.label).join(', ')} are pending
          backend support and are hidden rather than shown returning wrong results.
        </span>
      </p>

      <DataList<UserSummary>
        rows={rows}
        columns={userColumns}
        rowKey={(user) => user.id}
        // Names each card's open control, e.g. "View Ayesha Rahman".
        rowLabel={(user) => user.displayName}
        loading={query.isPending}
        error={
          query.isError
            ? {
                message: isAppError(query.error)
                  ? query.error.message
                  : 'The user directory could not be loaded.',
                ...(isAppError(query.error) && query.error.correlationId
                  ? { correlationId: query.error.correlationId }
                  : {}),
              }
            : null
        }
        onRetry={() => void query.refetch()}
        sort={{ field: params.sortBy, direction: params.sortOrder }}
        onSortChange={(sort) => setSort(sort.field, sort.direction)}
        {...(can(PERMISSIONS.usersView)
          ? {
              onRowClick: (user: UserSummary) => {
                void navigate(ROUTES.user(user.id))
              },
            }
          : {})}
        emptyTitle={
          activeFilterCount > 0 ? 'No users match these filters' : 'No users yet'
        }
        emptyDescription={
          activeFilterCount > 0
            ? 'Try widening the search or clearing a filter.'
            : 'Registered accounts will appear here.'
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
          {formatCount(pagination.total)} users found.
        </p>
      ) : null}
    </div>
  )
}
