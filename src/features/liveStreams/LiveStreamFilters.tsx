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
import { LIVE_ROOM_TYPES, LIVE_TOPICS, OFFERED_LIVE_SORTS } from '@/types/liveRooms'

import { SORT_LABELS, TOPIC_LABELS, TYPE_LABELS } from './labels'
import type {
  LiveFilterKey,
  LiveStreamFilters as Filters,
  LiveTab,
  OfferedSort,
} from './useLiveStreamParams'

/**
 * The Live streams filters (plan.md Live §5.1).
 *
 * One grid, one baseline — a label over a 40px control, four to a row on
 * desktop, as on the wallet ledger. Each tab shows only what its route reads
 * (plan.md L-B4): topic, type, status and order on Live now; dates on Past.
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

export function LiveSearch({
  value,
  onCommit,
  hideLabel = false,
}: {
  value: string | undefined
  onCommit: (value: string) => void
  hideLabel?: boolean
}) {
  return (
    <Field id="live-search" label="Search" hideLabel={hideLabel}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground-subtle"
          aria-hidden="true"
        />
        <Input
          key={value ?? ''}
          id="live-search"
          type="search"
          className="pl-9"
          placeholder="Stream title or host name"
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

function Choice({
  id,
  label,
  value,
  anyLabel,
  options,
  onChange,
}: {
  id: string
  label: string
  value: string | undefined
  anyLabel?: string
  options: readonly { value: string; label: string }[]
  onChange: (value: string | undefined) => void
}) {
  return (
    <Field id={id} label={label}>
      <Select
        value={value ?? ANY}
        onValueChange={(next) => onChange(next === ANY ? undefined : next)}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {anyLabel ? <SelectItem value={ANY}>{anyLabel}</SelectItem> : null}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

export function LiveStreamFilters({
  tab,
  filters,
  sort,
  withSearch,
  setFilter,
  setDateRange,
  setSort,
}: {
  tab: LiveTab
  filters: Filters
  sort: OfferedSort
  withSearch: boolean
  setFilter: (key: LiveFilterKey, value: string | undefined) => void
  setDateRange: (from: string | undefined, to: string | undefined) => void
  setSort: (sort: OfferedSort) => void
}) {
  const [from, setFrom] = useDraft(filters.fromDate ?? '')
  const [to, setTo] = useDraft(filters.toDate ?? '')
  const backwards = Boolean(from && to && to < from)

  function changeDates(nextFrom: string, nextTo: string) {
    setFrom(nextFrom)
    setTo(nextTo)
    if (nextFrom && nextTo && nextTo < nextFrom) return
    setDateRange(nextFrom || undefined, nextTo || undefined)
  }

  return (
    <div className="w-full space-y-2">
      <div className="grid grid-cols-1 items-end gap-x-3 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        {withSearch ? (
          <div className="sm:col-span-2">
            <LiveSearch
              value={filters.search}
              onCommit={(value) => setFilter('search', value)}
            />
          </div>
        ) : null}

        {tab === 'live' ? (
          <>
            <Choice
              id="live-status"
              label="Status"
              value={filters.status === 'PAUSED' ? 'PAUSED' : undefined}
              anyLabel="Live"
              options={[{ value: 'PAUSED', label: 'Paused (host away)' }]}
              onChange={(value) => setFilter('status', value)}
            />
            <Choice
              id="live-topic"
              label="Topic"
              value={filters.topic}
              anyLabel="All topics"
              options={LIVE_TOPICS.map((value) => ({
                value,
                label: TOPIC_LABELS[value],
              }))}
              onChange={(value) => setFilter('topic', value)}
            />
            <Choice
              id="live-type"
              label="Type"
              value={filters.type}
              anyLabel="Audio and video"
              options={LIVE_ROOM_TYPES.map((value) => ({
                value,
                label: TYPE_LABELS[value],
              }))}
              onChange={(value) => setFilter('type', value)}
            />
            <Choice
              id="live-sort"
              label="Order"
              value={sort}
              options={OFFERED_LIVE_SORTS.map((value) => ({
                value,
                label: SORT_LABELS[value],
              }))}
              onChange={(value) => setSort(value === 'viewers' ? 'viewers' : 'recent')}
            />
          </>
        ) : (
          <>
            <Field id="live-from" label="From">
              <Input
                id="live-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => changeDates(event.target.value, to)}
                aria-describedby="live-dates-hint"
              />
            </Field>
            <Field id="live-to" label="To">
              <Input
                id="live-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => changeDates(from, event.target.value)}
                aria-invalid={backwards || undefined}
                aria-describedby="live-dates-hint"
              />
            </Field>
          </>
        )}
      </div>

      {backwards ? (
        <p role="alert" className="text-caption text-danger-foreground">
          The end date is before the start date.
        </p>
      ) : null}

      <p className="text-caption text-foreground-muted">
        {tab === 'live' ? (
          'Showing rooms on air now. Paused rooms are ones whose host has dropped and not come back yet.'
        ) : (
          <span id="live-dates-hint">Dates are whole days in Bangladesh time.</span>
        )}
      </p>
    </div>
  )
}
