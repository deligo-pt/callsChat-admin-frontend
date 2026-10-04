import {
  Archive,
  Info,
  MoreHorizontal,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import { isAppError } from '@/api/errors'
import { DataList, FilterBar, Pagination, type AppliedFilter } from '@/components/data'
import { PageHeader } from '@/components/display'
import { ConfirmActionDialog } from '@/components/feedback'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  ANNOUNCEMENT_AUDIENCE_VALUES,
  ANNOUNCEMENT_PRIORITY_VALUES,
  ANNOUNCEMENT_STATUS_VALUES,
  type Announcement,
} from '@/types/announcement'

import { AnnouncementEditorDialog } from './AnnouncementEditorDialog'
import { announcementColumns } from './announcementColumns'
import { AUDIENCE_LABELS } from './labels'
import { ANY } from './listParams'
import { StatsStrip } from './StatsStrip'
import {
  useAnnouncementListQuery,
  useAnnouncementPinMutation,
  useAnnouncementStatsQuery,
  useDeleteAnnouncementMutation,
  useUpdateAnnouncementMutation,
} from './useAnnouncements'
import { useAnnouncementListParams } from './useAnnouncementListParams'

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
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-caption text-foreground-muted">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full lg:w-[11rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  )
}

/**
 * The announcements queue — `/announcements` (plan.md §5, phase B2).
 *
 * Every row here is a message addressed to the entire userbase, and three
 * things follow from that rather than from list-page convention.
 *
 * 1. **The queue opens unfiltered.** Unlike the verification queue, which opens
 *    on `PENDING` because somebody is waiting behind each row, nobody is waiting
 *    on an announcement. The question an operator arrives with is *"what have we
 *    published, and what is still a draft?"* — a question about the whole table.
 * 2. **Nothing is sortable.** The endpoint accepts no `sortBy` and silently
 *    ignores unknown parameters, so the page states its order once instead of
 *    offering headers that reorder nothing (O4).
 * 3. **Pinning is the only write on this screen**, and it is the only write in
 *    the module that is optimistic — see `useAnnouncements.ts`. Composing,
 *    editing and deleting arrive in B3.
 *
 * No primary action yet: "New announcement" belongs to B3, and a button that
 * opened nothing would be worse than its absence.
 */
export function AnnouncementsPage() {
  const {
    query,
    status,
    priority,
    targetAudience,
    pinned,
    search,
    setStatus,
    setPriority,
    setTargetAudience,
    setPinned,
    setSearch,
    setPage,
    setLimit,
    clearAll,
    activeFilterCount,
  } = useAnnouncementListParams()

  const listQuery = useAnnouncementListQuery(query)
  const statsQuery = useAnnouncementStatsQuery()
  const pinMutation = useAnnouncementPinMutation()
  const deleteMutation = useDeleteAnnouncementMutation()
  const archiveMutation = useUpdateAnnouncementMutation()

  /*
   * ⚠️ Three separate pieces of state rather than one `mode` union, because the
   * editor and a confirm dialog can never be open at once and conflating them
   * would make that a thing to reason about. `editing === null` with
   * `editorOpen === true` is the compose case.
   */
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [deleting, setDeleting] = useState<Announcement | null>(null)
  const [archiving, setArchiving] = useState<Announcement | null>(null)

  function compose() {
    setEditing(null)
    setEditorOpen(true)
  }

  function edit(record: Announcement) {
    setEditing(record)
    setEditorOpen(true)
  }

  const rows = listQuery.data?.data ?? []
  const pagination = listQuery.data?.pagination
  const page = pagination?.page ?? 1
  const total = pagination?.total ?? 0
  const totalPages = pagination?.totalPages ?? 1

  /*
   * ⚠️ An out-of-range page, which this endpoint does not clamp. `?page=99`
   * answers 200 with `page: 99` echoed back, no rows and `total` unchanged — so
   * neither `total` nor `totalPages` can detect it. Only the row count can.
   */
  const pastTheEnd = !listQuery.isPending && rows.length === 0 && page > 1

  const statusLabel =
    status === ANY ? 'All statuses' : resolveStatus('announcement', status).label

  /*
   * ⚠️ **A chip means "you changed this from the default".** Every facet here
   * defaults to `ALL`, so that rule and "this view is narrowed" happen to be
   * the same condition — which is why this page needs none of the chip
   * machinery the verification queue had to grow. Its default view is itself a
   * filter, so a chip there could be permanent and "Clear all" could appear to
   * fail; here clearing genuinely empties the row every time.
   */
  const appliedChips: AppliedFilter[] = []
  if (status !== ANY) {
    appliedChips.push({ id: 'status', label: 'Status', value: statusLabel })
  }
  if (priority !== ANY) {
    appliedChips.push({
      id: 'priority',
      label: 'Priority',
      value: resolveStatus('announcementPriority', priority).label,
    })
  }
  if (targetAudience !== ANY) {
    appliedChips.push({
      id: 'targetAudience',
      label: 'Audience',
      value: AUDIENCE_LABELS[targetAudience],
    })
  }
  if (pinned !== ANY) {
    appliedChips.push({
      id: 'pinned',
      label: 'Pinned',
      value: pinned === 'true' ? 'Pinned only' : 'Unpinned only',
    })
  }
  if (search) {
    appliedChips.push({ id: 'search', label: 'Search', value: search })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        description="Official messages broadcast to the CallsChat userbase."
        breadcrumbs={[{ label: 'Announcements' }]}
        /*
         * ⚠️ Labelled "New announcement", not "Broadcast" or "Send". The button
         * opens a form; it does not send anything. Naming it for the
         * consequence would make the dangerous act feel like it had already
         * happened one click early.
         */
        actions={
          <Button onClick={compose}>
            <Plus aria-hidden="true" />
            New announcement
          </Button>
        }
        toolbar={
          <FilterBar
            applied={appliedChips}
            onRemove={(id) => {
              /* Every chip's ✕ returns that facet to its default, `ALL`. */
              if (id === 'status') setStatus(ANY)
              else if (id === 'priority') setPriority(ANY)
              else if (id === 'targetAudience') setTargetAudience(ANY)
              else if (id === 'pinned') setPinned(ANY)
              else if (id === 'search') setSearch(undefined)
            }}
            onClearAll={clearAll}
            search={
              <div className="space-y-1.5">
                <Label
                  htmlFor="announcement-search"
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
                    id="announcement-search"
                    type="search"
                    className="pl-9"
                    /*
                     * ⚠️ Deliberately does not promise body-text search.
                     * `broadcast.md` §3.1 claims `search` covers title AND
                     * content, but it states that for the *client feed* and the
                     * admin route could never be exercised — the live table is
                     * empty (plan.md O9). The mock takes the wider reading, so
                     * a placeholder reading "Headline or body text" would look
                     * verified in development and could be false in production,
                     * which is the worst of both.
                     */
                    placeholder="Search announcements"
                    /*
                     * ⚠️ `key` remounts the input when the URL's term changes.
                     * `defaultValue` is read once, so without this an
                     * uncontrolled input keeps showing a term that has already
                     * been cleared — the results update while the box still
                     * claims to be filtering, which reads as "Clear all"
                     * half-working. Remounting only happens when the committed
                     * value differs, and this input commits on Enter or blur,
                     * so it never interrupts typing.
                     */
                    key={search ?? ''}
                    defaultValue={search ?? ''}
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
              id="filter-announcement-status"
              label="Status"
              value={status}
              onChange={setStatus}
            >
              <SelectItem value={ANY}>All statuses</SelectItem>
              {ANNOUNCEMENT_STATUS_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {resolveStatus('announcement', value).label}
                </SelectItem>
              ))}
            </FilterSelect>

            <FilterSelect
              id="filter-announcement-priority"
              label="Priority"
              value={priority}
              onChange={setPriority}
            >
              <SelectItem value={ANY}>Any priority</SelectItem>
              {ANNOUNCEMENT_PRIORITY_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {resolveStatus('announcementPriority', value).label}
                </SelectItem>
              ))}
            </FilterSelect>

            <FilterSelect
              id="filter-announcement-audience"
              label="Audience"
              value={targetAudience}
              onChange={setTargetAudience}
            >
              <SelectItem value={ANY}>Any audience</SelectItem>
              {ANNOUNCEMENT_AUDIENCE_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {AUDIENCE_LABELS[value]}
                </SelectItem>
              ))}
            </FilterSelect>

            <FilterSelect
              id="filter-announcement-pinned"
              label="Pinned"
              value={pinned}
              onChange={setPinned}
            >
              {/*
               * ⚠️ Three options, not a checkbox. The service accepts
               * `isPinned=false` as a real narrowing, so a checkbox — which can
               * only express "pinned only" and "no filter" — would hide a
               * filter the API offers.
               */}
              <SelectItem value={ANY}>Pinned and unpinned</SelectItem>
              <SelectItem value="true">Pinned only</SelectItem>
              <SelectItem value="false">Unpinned only</SelectItem>
            </FilterSelect>
          </FilterBar>
        }
      />

      {/*
       * ⚠️ Rendered only once the counters arrive. A failure of the stats route
       * must never look like a failure of the queue it decorates — the hook is
       * `retry: false` for the same reason — and the table below stands on its
       * own without it.
       */}
      {statsQuery.data || statsQuery.isPending ? (
        <StatsStrip
          stats={statsQuery.data}
          loading={statsQuery.isPending}
          activeStatus={status === ANY ? undefined : status}
          activePinned={pinned}
          onSelectStatus={setStatus}
          onSelectPinned={setPinned}
        />
      ) : null}

      {/*
       * ⚠️ States the order, and that it cannot be changed. Both halves are
       * load-bearing: pinned-first is not obvious from looking at the table, and
       * an operator who tries to click a header needs to know why nothing
       * happened (O4).
       */}
      <p className="flex items-start gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-caption text-foreground-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Pinned announcements first, then newest published. This queue cannot be
          re-sorted: the API accepts no sort field.
        </span>
      </p>

      <DataList<Announcement>
        rows={rows}
        columns={announcementColumns}
        rowKey={(record) => record.id}
        rowLabel={(record) => record.title}
        loading={listQuery.isPending}
        error={
          listQuery.isError
            ? {
                message: isAppError(listQuery.error)
                  ? listQuery.error.message
                  : 'The announcements queue could not be loaded.',
                ...(isAppError(listQuery.error) && listQuery.error.correlationId
                  ? { correlationId: listQuery.error.correlationId }
                  : {}),
              }
            : null
        }
        onRetry={() => void listQuery.refetch()}
        /*
         * Opening a row edits it. There is no detail page to navigate to — no
         * `GET /admin/announcements/:id` exists (§3.2) — and the row already
         * carries the whole record, so the editor is seeded straight from it.
         */
        onRowClick={edit}
        /*
         * ⚠️ **Pin lives in `rowActions`, not in a cell.** Both renderers stop
         * click propagation on the actions slot, so when B3 makes a row open the
         * editor, pinning will not also open it. Putting the control in a cell
         * now would mean moving it then.
         */
        rowActions={(record) => {
          const next = !record.isPinned
          const busy = pinMutation.isPending && pinMutation.variables?.id === record.id

          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                loading={busy}
                /*
                 * The accessible name states the OUTCOME, not the current
                 * state. "Pinned" would leave a screen-reader user unsure
                 * whether pressing it pins or unpins.
                 */
                aria-label={`${next ? 'Pin' : 'Unpin'} ${record.title}`}
                onClick={() => {
                  pinMutation.mutate({ id: record.id, isPinned: next })
                }}
              >
                {record.isPinned ? (
                  <PinOff aria-hidden="true" />
                ) : (
                  <Pin aria-hidden="true" />
                )}
              </Button>

              {/*
               * ⚠️ The two destructive actions sit behind a menu while pin sits
               * in the open, and that asymmetry is the point. Pinning is
               * reversible in one click; archiving withdraws a message from
               * every user's feed and deleting destroys it and its media
               * permanently. Neither belongs one stray click from a row the
               * operator was only trying to open.
               */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`More actions for ${record.title}`}
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {/*
                   * Archive is offered only for something currently live.
                   * Archiving a draft would be a no-op an operator could not
                   * tell from a failure, and re-archiving an archived record
                   * doubly so.
                   */}
                  {record.status === 'PUBLISHED' ? (
                    <DropdownMenuItem onSelect={() => setArchiving(record)}>
                      <Archive aria-hidden="true" />
                      Archive
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setDeleting(record)}
                  >
                    <Trash2 aria-hidden="true" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        }}
        /*
         * Three empty states. The third is the out-of-range-page mitigation
         * doing something useful: an operator following a stale link to
         * `?page=99` lands on a blank page which would otherwise tell them to
         * clear filters they never set.
         */
        emptyTitle={
          pastTheEnd
            ? 'There is no page here'
            : activeFilterCount > 0
              ? 'No announcements match this view'
              : 'No announcements yet'
        }
        emptyDescription={
          pastTheEnd
            ? `This view has ${formatCount(totalPages)} ${
                totalPages === 1 ? 'page' : 'pages'
              }. Go back to the first one to see the queue.`
            : activeFilterCount > 0
              ? 'Try another status, priority or audience, or a wider search.'
              : /*
                 * ⚠️ This is the state the live platform is actually in — the
                 * announcements table holds zero rows — so it is the first thing
                 * anyone will see on this screen, not an edge case.
                 */
                'Nothing has been broadcast to the userbase yet.'
        }
        emptyAction={
          pastTheEnd ? (
            <Button variant="outline" onClick={() => setPage(1)}>
              Back to the first page
            </Button>
          ) : activeFilterCount > 0 ? (
            <Button variant="outline" onClick={clearAll}>
              Clear all filters
            </Button>
          ) : null
        }
      />

      {/*
       * ⚠️ Driven by `total`, never by `totalPages` — an out-of-range page is
       * echoed back rather than clamped. `Pagination` does the clamping; this
       * condition only decides whether there is anything to page through.
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
          {formatCount(total)} {total === 1 ? 'announcement' : 'announcements'} found
          {status === ANY ? '' : ` with status ${statusLabel.toLowerCase()}`}.
        </p>
      ) : null}

      <AnnouncementEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        record={editing}
      />

      {/*
       * ⚠️ **Archive, not delete, is the way to take a message out of the
       * feed** — and the dialog has to say which one the operator picked,
       * because the two are one menu item apart and only one is reversible.
       */}
      <ConfirmActionDialog
        open={archiving !== null}
        onOpenChange={(next) => {
          if (!next) setArchiving(null)
        }}
        title="Archive announcement"
        target={archiving?.title ?? ''}
        effect="This removes the announcement from the app for everyone. It is not deleted — the record and its media are kept, and it can be published again."
        severity="warning"
        /*
         * ⚠️ `reason="none"`. The announcements API has nowhere to put one:
         * `PATCH` accepts no reason field and writes no audit row, so demanding
         * ten characters the client then discards would imply a record that is
         * never even sent. The same decision the staff and approve dialogs
         * reached, for the same reason.
         */
        reason="none"
        confirmLabel="Archive"
        loading={archiveMutation.isPending}
        onConfirm={() => {
          if (!archiving) return
          const target = archiving
          archiveMutation.mutate(
            { id: target.id, payload: { status: 'ARCHIVED' } },
            {
              onSuccess: () => {
                toast.success('Archived. It is no longer visible in the app.')
                setArchiving(null)
              },
              /*
               * The dialog stays open on failure so the operator can retry
               * without finding the row again — and so a failure is not
               * mistaken for a success by the dialog simply vanishing.
               */
              onError: (error) => {
                toast.error(
                  isAppError(error)
                    ? error.message
                    : 'The announcement was not archived.',
                )
              },
            },
          )
        }}
      />

      <ConfirmActionDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null)
        }}
        title="Delete announcement"
        target={deleting?.title ?? ''}
        /*
         * ⚠️ Three facts, and every one of them is load-bearing: the record
         * goes, the media goes with it irrecoverably (§3.4 — this is the only
         * route that ever deletes an uploaded file), and the notification
         * already sent is NOT recalled. An operator deleting a published
         * announcement to "undo" it would otherwise believe they had.
         */
        effect={
          deleting?.status === 'PUBLISHED'
            ? 'The announcement and any attached media are destroyed permanently. Users who already received the notification keep it — deleting does not recall anything.'
            : 'The announcement and any attached media are destroyed permanently. This cannot be undone.'
        }
        severity="critical"
        reason="none"
        /*
         * ⚠️ A typed confirmation, reserved for irreversible actions. The
         * headline rather than the id: it is what the operator can see on the
         * row, and typing it means they looked at which row they are on — which
         * is the mistake this guards against, not a slip of the finger.
         */
        {...(deleting ? { typedConfirmation: deleting.title } : {})}
        confirmLabel="Delete permanently"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (!deleting) return
          deleteMutation.mutate(deleting.id, {
            onSuccess: () => {
              /*
               * Names the media, because that is the part an operator cannot
               * get back and did not explicitly ask to destroy (§3.4). The
               * dialog said so beforehand; the toast confirms it happened.
               */
              toast.success(
                'Deleted. The announcement and any attached media are gone.',
              )
              setDeleting(null)
            },
            onError: (error) => {
              toast.error(
                isAppError(error) ? error.message : 'The announcement was not deleted.',
              )
            },
          })
        }}
      />
    </div>
  )
}
