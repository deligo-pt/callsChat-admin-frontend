import { Info } from 'lucide-react'

import { isAppError } from '@/api/errors'
import {
  AppliedFilterChips,
  DataList,
  Pagination,
  type AdminColumn,
  type AppliedFilter,
} from '@/components/data'
import { PageHeader } from '@/components/display'
import { Button } from '@/components/ui/button'
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
  if (key === 'contextId') return id
  const party = key === 'senderId' ? rows[0]?.sender : rows[0]?.receiver
  return party?.id === id && party.displayName?.trim() ? party.displayName.trim() : id
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

  const applied: AppliedFilter[] = (
    Object.entries(filters) as [LedgerFilterKey, string][]
  ).map(([key, id]) => ({
    id: key,
    label: FILTER_LABELS[key],
    value: partyName(rows, key, id),
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
        description="Every gift sent between users, newest first. Top-ups and balance adjustments are not here — the backend has no ledger for them yet."
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
