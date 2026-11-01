import { Search } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/cn'

import { TYPE_OPTIONS } from '@/lib/walletLabels'
import type { WalletFilterKey, WalletLedgerFilters } from './useWalletLedgerParams'

/**
 * The wallet ledger's filter controls (plan.md T2).
 *
 * ⚠️ **One grid, one baseline.** Every field is a label over a 40px control,
 * four to a row on desktop: search takes two cells, then type and direction;
 * then from, to, minimum and order. Nothing hangs below a single field —
 * hints and errors share one line under the whole grid — so a message can
 * never push one control out of line with its neighbours.
 */

const ANY = 'all'

const LABEL = 'text-caption text-foreground-muted'

function Field({
  id,
  label,
  hideLabel = false,
  className,
  children,
}: {
  id: string
  label: string
  /** Visually hidden, still named for assistive tech. */
  hideLabel?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={id} className={hideLabel ? 'sr-only' : LABEL}>
        {label}
      </Label>
      {children}
    </div>
  )
}

/** Holds a draft of `value` that resets whenever the URL's value changes. */
function useDraft<T>(value: T) {
  const [draft, setDraft] = useState(value)
  const [synced, setSynced] = useState(value)
  if (synced !== value) {
    setSynced(value)
    setDraft(value)
  }
  return [draft, setDraft] as const
}

export function WalletSearch({
  value,
  onCommit,
  hideLabel = false,
}: {
  value: string | undefined
  onCommit: (value: string) => void
  /**
   * On a phone the search sits on one row with the Filters button; a visible
   * label above it would push the box below the button's line.
   */
  hideLabel?: boolean
}) {
  return (
    <Field id="wallet-search" label="Search" hideLabel={hideLabel}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground-subtle"
          aria-hidden="true"
        />
        <Input
          key={value ?? ''}
          id="wallet-search"
          type="search"
          className="pl-9"
          placeholder="Name, username, email, note or reference"
          defaultValue={value ?? ''}
          /* Committed on Enter or blur, as on the user directory. */
          onKeyDown={(event) => {
            if (event.key === 'Enter') onCommit(event.currentTarget.value)
          }}
          onBlur={(event) => onCommit(event.currentTarget.value)}
        />
      </div>
    </Field>
  )
}

export function WalletFilters({
  filters,
  oldestFirst,
  withSearch,
  setFilter,
  setDateRange,
  setOldestFirst,
}: {
  filters: WalletLedgerFilters
  oldestFirst: boolean
  /** On desktop the search sits in the grid; on mobile, above the sheet. */
  withSearch: boolean
  setFilter: (key: WalletFilterKey, value: string | undefined) => void
  setDateRange: (from: string | undefined, to: string | undefined) => void
  setOldestFirst: (oldestFirst: boolean) => void
}) {
  /*
   * Drafts, so an invalid entry is refused with a reason instead of silently
   * snapping back to the URL's value.
   */
  const [from, setFrom] = useDraft(filters.fromDate ?? '')
  const [to, setTo] = useDraft(filters.toDate ?? '')
  const [min, setMin] = useDraft(filters.minAmount ?? '')

  const backwards = Boolean(from && to && to < from)
  const minText = min.trim()
  const minInvalid =
    minText !== '' && !(Number.isInteger(Number(minText)) && Number(minText) >= 1)

  function changeDates(nextFrom: string, nextTo: string) {
    setFrom(nextFrom)
    setTo(nextTo)
    if (nextFrom && nextTo && nextTo < nextFrom) return
    setDateRange(nextFrom || undefined, nextTo || undefined)
  }

  function commitMin() {
    if (!minInvalid) setFilter('minAmount', minText || undefined)
  }

  const errors = [
    backwards ? 'The end date is before the start date.' : null,
    minInvalid ? 'The minimum must be a whole number, 1 or more.' : null,
  ].filter((error): error is string => error !== null)

  return (
    <div className="w-full space-y-2">
      <div className="grid grid-cols-1 items-end gap-x-3 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        {withSearch ? (
          <div className="sm:col-span-2">
            <WalletSearch
              value={filters.search}
              onCommit={(value) => setFilter('search', value)}
            />
          </div>
        ) : null}

        <Field id="wallet-type" label="Type">
          <Select
            value={filters.type ?? ANY}
            onValueChange={(value) =>
              setFilter('type', value === ANY ? undefined : value)
            }
          >
            <SelectTrigger id="wallet-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All types</SelectItem>
              {TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field id="wallet-direction" label="Direction">
          <Select
            value={filters.direction ?? ANY}
            onValueChange={(value) =>
              setFilter('direction', value === ANY ? undefined : value)
            }
          >
            <SelectTrigger
              id="wallet-direction"
              className="w-full"
              aria-describedby="wallet-direction-hint"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Credits and debits</SelectItem>
              <SelectItem value="CREDIT">Credits</SelectItem>
              <SelectItem value="DEBIT">Debits</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field id="wallet-from" label="From">
          <Input
            id="wallet-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => changeDates(event.target.value, to)}
            aria-describedby="wallet-dates-hint"
          />
        </Field>

        <Field id="wallet-to" label="To">
          <Input
            id="wallet-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => changeDates(from, event.target.value)}
            aria-invalid={backwards || undefined}
            aria-describedby="wallet-dates-hint"
          />
        </Field>

        <Field id="wallet-min" label="At least (Diamonds)">
          <Input
            id="wallet-min"
            inputMode="numeric"
            value={min}
            placeholder="Any amount"
            onChange={(event) => setMin(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitMin()
            }}
            onBlur={commitMin}
            aria-invalid={minInvalid || undefined}
            aria-describedby="wallet-min-hint"
          />
        </Field>

        <Field id="wallet-sort" label="Order">
          <Select
            value={oldestFirst ? 'asc' : 'desc'}
            onValueChange={(value) => setOldestFirst(value === 'asc')}
          >
            <SelectTrigger id="wallet-sort" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Newest first</SelectItem>
              <SelectItem value="asc">Oldest first</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      {errors.length > 0 ? (
        <p role="alert" className="text-caption text-danger-foreground">
          {errors.join(' ')}
        </p>
      ) : null}

      {/*
       * The hints, together. ⚠️ plan.md B2: the API filters direction by
       * sign, so free gifts (amount 0) are under neither.
       */}
      <p className="text-caption text-foreground-muted">
        <span id="wallet-dates-hint">Dates are whole days in Bangladesh time.</span>{' '}
        <span id="wallet-direction-hint">
          Free gifts (0 Diamonds) are neither credits nor debits.
        </span>{' '}
        <span id="wallet-min-hint">The minimum counts credits and debits alike.</span>
      </p>
    </div>
  )
}
