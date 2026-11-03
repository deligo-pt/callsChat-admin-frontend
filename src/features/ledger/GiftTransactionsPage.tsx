import { Info, Wallet } from 'lucide-react'
import { Link } from 'react-router'

import { isAppError } from '@/api/errors'
import { ROUTES } from '@/app/routes'
import { PERMISSIONS } from '@/auth/permissions'
import { useCan } from '@/auth/useAuth'
import {
  AppliedFilterChips,
  DataList,
  Pagination,
  type AdminColumn,
  type AppliedFilter,
} from '@/components/data'
import { PageHeader } from '@/components/display'
import { useLiveRoomTitle } from '@/components/live'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { bangladeshDay } from '@/lib/datetime'
import type { GiftTransaction } from '@/types/catalog'

import { ContextCell, DiamondsCell, GiftCell, PartyCell, SentCell } from './cells'
import { useGiftLedgerQuery } from './useGiftLedger'
import { useLedgerListParams, type LedgerFilterKey } from './useLedgerListParams'

/**
 * The gift ledger — `GET /admin/gifts/transactions` (plan.md §3.2, phase G5).
 *
 * ⚠️ **A destination more than a page.** Most operators arrive from a person:
 * "Gifts sent" / "Gifts received" on the user record, or a host's gift count
 * on the roster. So the URL carries `senderId` / `receiverId`, and the
 * applied filter is named after the person, not the id.
 *
 * ⚠️ **This is the gift ledger, not the diamond ledger** (plan.md O9). There
 * are no top-ups, adjustments or bonuses in it, and the header says so.
 *
 * Measured live 2026-10-28: newest first and not sortable; a page past the
 * end answers an empty list with the true `total`, not an error.
 */

const FILTER_LABELS: Record<LedgerFilterKey, string> = {
  senderId: 'Sent by',
  receiverId: 'Received by',
  contextId: 'Room',
}

/**
 * The person's name for a filter chip, read from the rows themselves: when
 * filtered by `senderId`, every row's sender is that person. Falls back to the
 * id when there are no rows to read it from.
 */
function partyName(
  rows: readonly GiftTransaction[],
  key: LedgerFilterKey,
  id: string,
): string {
  /* A room is named by `roomChipName` — never its raw id. */
  if (key === 'contextId') return 'This live room'
  const party = key === 'senderId' ? rows[0]?.sender : rows[0]?.receiver
  return party?.id === id && party.displayName?.trim() ? party.displayName.trim() : id
}

/**
 * plan.md T5 — from a gift to the sender's wallet. ⚠️ **There is no shared
 * id** (R2: the wallet row's `refId` is the gift slug), so this opens the
 * sender's gift spends on that Bangladesh day, and says so — it is the
 * matching entries, not one proven entry. Free gifts (0 Diamonds) still
 * write a wallet row, so the link is offered for those too.
 *
 * No permission check here: this page is itself behind `ledger.view`, the
 * same key the wallet ledger needs.
 */
function SenderWalletLink({ row }: { row: GiftTransaction }) {
  const day = bangladeshDay(row.createdAt)
  if (!row.senderId || !day) return null
  const who = row.sender?.displayName?.trim() || 'the sender'
  const label = "Sender's wallet that day"
  /*
   * Icon-only in the table (a text button squeezed From / To into three
   * lines at 1440), with the words on cards, where the actions get a row
   * of their own. The table switches in at `lg`, as `DataList` does.
   */
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="sm" asChild className="lg:size-9 lg:p-0">
          <Link
            to={ROUTES.walletLedger({
              userId: row.senderId,
              type: 'GIFT_SENT',
              fromDate: day,
              toDate: day,
            })}
            aria-label={`Wallet entries for gifts ${who} sent that day`}
          >
            <Wallet aria-hidden="true" />
            <span className="lg:sr-only">{label}</span>
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        {label}. No shared id links the two records, so this lists the sender&apos;s
        gift spends on the same Bangladesh day.
      </TooltipContent>
    </Tooltip>
  )
}

export function GiftTransactionsPage() {
  const {
    query,
    filters,
    page,
    limit,
    setFilter,
    setPage,
    setLimit,
    clearAll,
    activeFilterCount,
  } = useLedgerListParams()

  const list = useGiftLedgerQuery(query)
  const rows = list.data?.data ?? []
  const pagination = list.data?.pagination
  const filtered = activeFilterCount > 0

  /* The room's title for its chip (plan.md Live L4); words, never the id. */
  const canViewLive = useCan(PERMISSIONS.liveView)
  const roomTitle = useLiveRoomTitle(filters.contextId ?? '', canViewLive)
  const roomChipName =
    roomTitle.data === null
      ? 'A room that no longer exists'
      : (roomTitle.data ?? 'This live room')

  const applied: AppliedFilter[] = (
    Object.entries(filters) as [LedgerFilterKey, string][]
  ).map(([key, id]) => ({
    id: key,
    label: FILTER_LABELS[key],
    value: key === 'contextId' ? roomChipName : partyName(rows, key, id),
  }))

  /*
   * ⚠️ Total known and rows empty: the operator is past the end (an old link,
   * or a page size raised). Distinct from "nothing matches".
   */
  const pastEnd = !list.isPending && rows.length === 0 && (pagination?.total ?? 0) > 0

  /*
   * ⚠️ Every live row is 0 / 0 (plan.md O1, O2). Said once, and only about
   * what is on screen — not a claim about the catalog.
   */
  const allFree =
    rows.length > 0 &&
    rows.every((row) => (row.totalPrice ?? 0) === 0 && (row.hostEarnings ?? 0) === 0)

  const columns: readonly AdminColumn<GiftTransaction>[] = [
    {
      id: 'gift',
      header: 'Gift',
      cell: (row) => <GiftCell record={row} />,
      card: 'title',
    },
    {
      id: 'sender',
      header: 'From',
      cell: (row) => <PartyCell id={row.senderId} name={row.sender?.displayName} />,
      card: 'meta',
    },
    {
      id: 'receiver',
      header: 'To',
      cell: (row) => <PartyCell id={row.receiverId} name={row.receiver?.displayName} />,
      card: 'meta',
    },
    {
      id: 'diamonds',
      header: 'Diamonds',
      cell: (row) => <DiamondsCell record={row} />,
      card: 'meta',
    },
    {
      id: 'context',
      header: 'Where',
      cell: (row) => (
        <ContextCell
          record={row}
          onOnlyThis={filters.contextId ? null : (id) => setFilter('contextId', id)}
        />
      ),
      card: 'meta',
    },
    {
      id: 'sent',
      header: 'Sent',
      cell: (row) => <SentCell record={row} />,
      card: 'meta',
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gift transactions"
        description="Every gift sent between users, newest first, with who received it and where. Top-ups, adjustments and every other diamond movement are in Wallet transactions."
        actions={
          <Button asChild variant="outline">
            <Link to={ROUTES.walletTransactions}>Wallet transactions</Link>
          </Button>
        }
      />

      {/*
       * Chips without controls: the three working filters are ids, which
       * nobody types. They arrive by link — from a person, a host, or a row's
       * "Only this room" — and are removed here.
       */}
      <AppliedFilterChips
        applied={applied}
        onRemove={(id) => setFilter(id as LedgerFilterKey, undefined)}
        onClearAll={clearAll}
      />

      {allFree ? (
        <p className="flex items-start gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-caption text-foreground-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Every gift on this page was sent at a price of 0 Diamonds, so no Diamonds
            moved and no receiver earned anything. The gifts in the catalog are priced
            at 0; that is the data, not a display fault.
          </span>
        </p>
      ) : null}

      <DataList
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.snapshotName ?? row.id}
        rowActions={(row) => <SenderWalletLink row={row} />}
        loading={list.isPending}
        error={
          list.isError
            ? {
                message: isAppError(list.error)
                  ? list.error.message
                  : 'The gift ledger could not be loaded.',
              }
            : null
        }
        onRetry={() => void list.refetch()}
        emptyTitle={
          pastEnd
            ? 'This page is past the end'
            : filtered
              ? 'No gifts match this view'
              : 'No gifts sent yet'
        }
        emptyDescription={
          pastEnd
            ? `There are ${pagination?.total ?? 0} gifts in this view, all on earlier pages.`
            : filtered
              ? 'Nothing was sent under these filters. Clearing them shows every gift.'
              : 'Gifts appear here as soon as someone sends one in the app.'
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
    </div>
  )
}
