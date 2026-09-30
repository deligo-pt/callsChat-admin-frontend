import { Info, Search } from 'lucide-react'
import { useNavigate } from 'react-router'

import { isAppError } from '@/api/errors'
import { ROUTES } from '@/app/routes'
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
import { formatCount } from '@/lib/format'
import { resolveStatus } from '@/lib/status'
import {
  VERIFICATION_STATUS_VALUES,
  VERIFICATION_TARGET_TYPE_VALUES,
  type Verification,
} from '@/types/verification'

import { DEFAULT_STATUS } from './listParams'
import { resolveSubject, SUBJECT_UNKNOWN_LABEL } from './subject'
import { useVerificationListQuery } from './useVerifications'
import { useVerificationListParams } from './useVerificationListParams'
import { verificationColumns } from './verificationColumns'

const TARGET_TYPE_LABELS: Readonly<Record<string, string>> = {
  USER_IDENTITY: 'Identity (KYC)',
  BUSINESS_ENTITY: 'Business (KYB)',
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
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-caption text-foreground-muted">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        {/*
         * ⚠️ `[&_[data-raw]]:hidden` suppresses the raw enum badge **in the
         * trigger only**. Radix mirrors the selected item's children into
         * `SelectValue`, so the badge added below for the dropdown also landed
         * in the closed control — rendering "Pending review PEND⌄", clipped
         * mid-word, which reads as a broken control rather than a hint.
         * It still shows in the open list, which is the one place it is needed.
         */}
        <SelectTrigger id={id} className="w-full lg:w-[12rem] [&_[data-raw]]:hidden">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  )
}

/**
 * The compliance queue — `/verifications` (plan.md §5.1).
 *
 * Applications from people who handed over a government identity document and
 * cannot use the product until somebody looks at it. Three things make it
 * different from the other lists in the panel.
 *
 * 1. **The status filter is never empty.** `ALL` is a value that gets *sent*,
 *    not the absence of a parameter — because omitting `status` silently
 *    filters to the pending applications rather than showing everything
 *    (§3.8). The notice below the filter bar says which status is on screen.
 * 2. **Nothing is sortable.** The endpoint accepts no `sortBy`, so the page
 *    states its order once instead of offering headers that reorder nothing.
 * 3. **A row may name nobody.** On business applications every `applicant`
 *    field is null (§3.4), so the Applicant column reads from the company
 *    instead — and says so when neither yields a name.
 *
 * No primary action: there is no admin submit endpoint, and a "New application"
 * button would file identity documents as the acting admin (§1.2).
 */
export function VerificationQueuePage() {
  const navigate = useNavigate()
  const {
    query,
    status,
    targetType,
    search,
    setStatus,
    setTargetType,
    setSearch,
    setPage,
    setLimit,
    clearAll,
    activeFilterCount,
  } = useVerificationListParams()

  const listQuery = useVerificationListQuery(query)

  const rows = listQuery.data?.requests ?? []
  const page = listQuery.data?.page ?? 1
  const total = listQuery.data?.total ?? 0
  const totalPages = listQuery.data?.totalPages ?? 1

  /*
   * ⚠️ An out-of-range page, which this endpoint does not clamp. `?page=99`
   * answers 200 with `page: 99` echoed back, `requests: []` and `total: 5`
   * unchanged — so neither `total` nor `totalPages` can detect it. Only the row
   * count can (§3.9).
   */
  const pastTheEnd = !listQuery.isPending && rows.length === 0 && page > 1

  const statusLabel =
    status === 'ALL' ? 'All statuses' : resolveStatus('verification', status).label

  const appliedChips: AppliedFilter[] = []

  /*
   * ⚠️ **A chip means "you changed this from the default" — in either
   * direction.** It does NOT mean "this view is narrowed", which is what V1
   * made it mean and what had to be undone.
   *
   * V1 showed the status chip for every value except `ALL`, including the
   * default `PENDING`, so that the filtered default view could never pass for
   * "all applications" (§3.8). The intent was right; a filter chip was the wrong
   * thing to say it with. A chip reads as *"you applied this, remove it"* — but
   * on a first load the operator applied nothing, and it left "Clear all"
   * unable to clear the one chip on screen, because clearing returns to the
   * default and the default IS `PENDING`. A button that visibly fails to do what
   * it says costs more trust than the chip ever bought.
   *
   * The §3.8 signal is unaffected: it is carried, far more explicitly, by the
   * notice strip below — *"Showing pending review applications only — choose All
   * statuses to see the rest"* — and by the Status select, which reads its value
   * on screen. The chip was duplicating that in a control-shaped wrapper.
   *
   * Widening to `ALL` now gets a chip too, which is the more useful of the two:
   * a queue showing every status is the state worth flagging.
   */
  if (status !== DEFAULT_STATUS) {
    appliedChips.push({ id: 'status', label: 'Status', value: statusLabel })
  }
  if (targetType !== 'ALL') {
    appliedChips.push({
      id: 'targetType',
      label: 'Type',
      value: TARGET_TYPE_LABELS[targetType] ?? targetType,
    })
  }
  if (search) {
    appliedChips.push({ id: 'search', label: 'Search', value: search })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Verifications"
        description="Identity and business applications waiting on a compliance decision."
        breadcrumbs={[{ label: 'Verifications' }]}
        toolbar={
          <FilterBar
            applied={appliedChips}
            onRemove={(id) => {
              /*
               * ⚠️ Every chip's ✕ returns that filter to **its own default** —
               * including status, which now goes back to `PENDING` rather than
               * widening to `ALL`.
               *
               * That reverses V1, and only because the chip's meaning changed
               * above. While the chip was permanent, ✕ had to widen or it would
               * have done nothing. Now that a chip exists only when the operator
               * has changed something, ✕ meaning "undo that change" is the only
               * reading consistent with Clear all — which does exactly this for
               * every filter at once.
               */
              if (id === 'status') setStatus(DEFAULT_STATUS)
              else if (id === 'targetType') setTargetType('ALL')
              else if (id === 'search') setSearch(undefined)
            }}
            /*
             * Passed unconditionally again, and the V4 special case is gone.
             *
             * `FilterBar` already hides "Clear all" when there are no chips, and
             * with the rule above "a chip exists" and "something differs from the
             * default" are now the same condition — so the button appears exactly
             * when it has work to do, and pressing it always empties the row.
             * That equivalence is what `canClearAll` was compensating for.
             */
            onClearAll={clearAll}
            search={
              <div className="space-y-1.5">
                <Label
                  htmlFor="verification-search"
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
                    id="verification-search"
                    type="search"
                    className="pl-9"
                    placeholder="Name, username, email or company"
                    /*
                     * ⚠️ `key` remounts the input when the URL's search term
                     * changes, which is the other half of the "Clear all" bug.
                     * `defaultValue` is read once, so an uncontrolled input kept
                     * showing a term that had already been cleared — the results
                     * updated while the box still claimed to be filtering by
                     * something. The screen contradicted itself, which reads as
                     * the button having half-worked.
                     *
                     * Remounting only happens when the committed value differs,
                     * and this input commits on Enter or blur, so it never
                     * interrupts typing.
                     */
                    key={search ?? ''}
                    defaultValue={search ?? ''}
                    /*
                     * Committed on Enter or blur, not per keystroke — the URL
                     * is the state store, and a history entry plus a request
                     * per character would be noisy and slow.
                     */
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        setSearch(event.currentTarget.value.trim() || undefined)
                      }
                    }}
                    onBlur={(event) =>
                      setSearch(event.currentTarget.value.trim() || undefined)
                    }
                  />
                </div>
              </div>
            }
          >
            <FilterSelect
              id="filter-verification-status"
              label="Status"
              value={status}
              onChange={setStatus}
            >
              {/*
               * ⚠️ `All statuses` is an ordinary option with a real value, not
               * a "clear" affordance. There is no empty state for this control:
               * every render sends a status, because not sending one means
               * something else entirely on this endpoint (§3.8).
               */}
              <SelectItem value="ALL">All statuses</SelectItem>
              {VERIFICATION_STATUS_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {resolveStatus('verification', value).label}
                  {/*
                   * `PENDING` and `PENDING_REVIEW` resolve to the same label by
                   * design (§3.2), so the raw value is shown beside it — this
                   * is the one screen where an operator needs to tell two
                   * identically-named options apart.
                   */}
                  <span data-raw className="ml-2 text-caption text-foreground-subtle">
                    {value}
                  </span>
                </SelectItem>
              ))}
            </FilterSelect>

            <FilterSelect
              id="filter-verification-type"
              label="Type"
              value={targetType}
              onChange={setTargetType}
            >
              <SelectItem value="ALL">All types</SelectItem>
              {VERIFICATION_TARGET_TYPE_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {TARGET_TYPE_LABELS[value] ?? value}
                </SelectItem>
              ))}
            </FilterSelect>
          </FilterBar>
        }
      />

      {/*
       * ⚠️ Says what is on screen and in what order — the §3.8 mitigation and
       * the "no sortable columns" statement in one line.
       *
       * The plan called for an exact "3 pending of 5 total" count here. That
       * needs a second, unfiltered request on every render to learn the total,
       * and the endpoint has no cheap way to ask; naming the filter achieves
       * the same thing — an operator cannot mistake this for everything — on
       * one request.
       */}
      <p className="flex items-start gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-caption text-foreground-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          {status === 'ALL' ? (
            <>Showing applications of every status, newest submission first.</>
          ) : (
            <>
              Showing{' '}
              <span className="font-medium text-foreground">
                {statusLabel.toLowerCase()}
              </span>{' '}
              applications only — choose{' '}
              <span className="font-medium text-foreground">All statuses</span> to see
              the rest. Newest submission first.
            </>
          )}{' '}
          This queue cannot be re-sorted: the API accepts no sort field.
        </span>
      </p>

      <DataList<Verification>
        rows={rows}
        columns={verificationColumns}
        rowKey={(record) => record.id}
        // Names each card's open control, e.g. "View DeliGo".
        rowLabel={(record) => resolveSubject(record).name ?? SUBJECT_UNKNOWN_LABEL}
        loading={listQuery.isPending}
        error={
          listQuery.isError
            ? {
                message: isAppError(listQuery.error)
                  ? listQuery.error.message
                  : 'The verification queue could not be loaded.',
                ...(isAppError(listQuery.error) && listQuery.error.correlationId
                  ? { correlationId: listQuery.error.correlationId }
                  : {}),
              }
            : null
        }
        onRetry={() => void listQuery.refetch()}
        onRowClick={(record: Verification) => {
          void navigate(ROUTES.verification(record.id))
        }}
        /*
         * ⚠️ Three empty states, not two. The third is the §3.9 mitigation
         * doing something useful: an operator following a stale link to
         * `?page=99` lands on a blank page which would otherwise tell them to
         * clear filters they never set.
         */
        emptyTitle={
          pastTheEnd
            ? 'There is no page here'
            : activeFilterCount > 0
              ? 'No applications match this view'
              : 'No applications yet'
        }
        emptyDescription={
          pastTheEnd
            ? `This view has ${formatCount(totalPages)} ${
                totalPages === 1 ? 'page' : 'pages'
              }. Go back to the first one to see the queue.`
            : activeFilterCount > 0
              ? 'Try another status, a different type, or a wider search.'
              : 'Identity and business applications submitted from the app will appear here.'
        }
        emptyAction={
          pastTheEnd ? (
            <Button variant="outline" onClick={() => setPage(1)}>
              Back to the first page
            </Button>
          ) : /*
           * Offered only when the view is narrowed — and the default view IS
           * narrowed, so this is the way out of an empty pending queue that
           * still holds decided applications.
           */
          activeFilterCount > 0 && status !== 'ALL' ? (
            <Button variant="outline" onClick={() => setStatus('ALL')}>
              Show every status
            </Button>
          ) : null
        }
      />

      {/*
       * ⚠️ Driven by `total`, never by `totalPages` — an out-of-range page is
       * echoed back rather than clamped (§3.9). `Pagination` does the clamping;
       * this condition only decides whether there is anything to page through.
       */}
      {total > 0 ? (
        <Pagination
          state={{ page, pageSize: query.limit ?? rows.length, total, totalPages }}
          onPageChange={setPage}
          onPageSizeChange={setLimit}
        />
      ) : null}

      {listQuery.data ? (
        <p className="sr-only" role="status">
          {/*
           * Names the filter as well as the number. "5 applications found" on a
           * screen showing only the pending ones would be the same lie the
           * notice above exists to prevent — and a screen-reader user has no
           * filter bar to glance at.
           */}
          {formatCount(total)} {total === 1 ? 'application' : 'applications'} found
          {status === 'ALL' ? '' : ` with status ${statusLabel.toLowerCase()}`}.
        </p>
      ) : null}
    </div>
  )
}
