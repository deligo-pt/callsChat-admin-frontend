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

import { SORT_OPTIONS } from './labels'
import type {
  WithdrawalFilterKey,
  WithdrawalFilters as Filters,
} from './useWithdrawalParams'

/**
 * Filters for the Withdrawals page (plan.md W1): search, a date range in
 * Bangladesh days, and the order. Status is the tab bar, not a filter here.
 */

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

/** A draft of `value` that resets whenever the URL's value changes. */
function useDraft<T>(value: T) {
  const [draft, setDraft] = useState(value)
  const [synced, setSynced] = useState(value)
  if (synced !== value) {
    setSynced(value)
    setDraft(value)
  }
  return [draft, setDraft] as const
}

export function WithdrawalSearch({
  value,
  onCommit,
  hideLabel = false,
}: {
  value: string | undefined
  onCommit: (value: string) => void
  hideLabel?: boolean
}) {
  return (
    <Field id="withdrawal-search" label="Search" hideLabel={hideLabel}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground-subtle"
          aria-hidden="true"
        />
        <Input
          key={value ?? ''}
          id="withdrawal-search"
          type="search"
          className="pl-9"
          placeholder={
            hideLabel
              ? 'Name, email or TrxID'
              : 'Host name, email, account holder or TrxID'
          }
          defaultValue={value ?? ''}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onCommit(event.currentTarget.value)
          }}
          onBlur={(event) => onCommit(event.currentTarget.value)}
        />
      </div>
    </Field>
  )
}

export function WithdrawalFilters({
  filters,
  sortBy,
  sortOrder,
  withSearch,
  setFilter,
  setDateRange,
  setSort,
}: {
  filters: Filters
  sortBy: string
  sortOrder: 'asc' | 'desc'
  withSearch: boolean
  setFilter: (key: WithdrawalFilterKey, value: string | undefined) => void
  setDateRange: (from: string | undefined, to: string | undefined) => void
  setSort: (field: string, direction: 'asc' | 'desc') => void
}) {
  const [from, setFrom] = useDraft(filters.fromDate ?? '')
  const [to, setTo] = useDraft(filters.toDate ?? '')
  const backwards = Boolean(from && to && to < from)
  const sortValue = `${sortBy}:${sortOrder}`
  const known = SORT_OPTIONS.some((option) => option.value === sortValue)

  function changeDates(nextFrom: string, nextTo: string) {
    setFrom(nextFrom)
    setTo(nextTo)
    if (nextFrom && nextTo && nextTo < nextFrom) return
    setDateRange(nextFrom || undefined, nextTo || undefined)
  }

  return (
    <div className="w-full space-y-2">
      <div className="grid grid-cols-1 items-end gap-x-3 gap-y-4 sm:grid-cols-2 lg:grid-cols-5">
        {withSearch ? (
          <div className="sm:col-span-2">
            <WithdrawalSearch
              value={filters.search}
              onCommit={(value) => setFilter('search', value)}
            />
          </div>
        ) : null}
        <Field id="withdrawal-from" label="Requested from">
          <Input
            id="withdrawal-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => changeDates(event.target.value, to)}
            aria-describedby="withdrawal-dates-hint"
          />
        </Field>
        <Field id="withdrawal-to" label="Requested to">
          <Input
            id="withdrawal-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => changeDates(from, event.target.value)}
            aria-invalid={backwards || undefined}
            aria-describedby="withdrawal-dates-hint"
          />
        </Field>
        <Field id="withdrawal-sort" label="Order">
          <Select
            value={known ? sortValue : 'createdAt:desc'}
            onValueChange={(next) => {
              const [field = 'createdAt', direction] = next.split(':')
              setSort(field, direction === 'asc' ? 'asc' : 'desc')
            }}
          >
            <SelectTrigger id="withdrawal-sort" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {backwards ? (
        <p role="alert" className="text-caption text-danger-foreground">
          The end date is before the start date.
        </p>
      ) : null}
      <p id="withdrawal-dates-hint" className="text-caption text-foreground-muted">
        Dates are whole days in Bangladesh time. Search does not match account numbers.
      </p>
    </div>
  )
}
