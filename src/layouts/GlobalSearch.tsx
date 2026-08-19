import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { apiClient } from '@/api/client'
import { queryKeys } from '@/api/queryKeys'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/cn'
import { searchResultSchema, type SearchResult } from '@/types/ops'
import { z } from 'zod'

const responseSchema = z.object({ data: z.array(searchResultSchema) })

const GROUP_LABELS: Readonly<Record<SearchResult['type'], string>> = {
  USER: 'Users',
  SOCIAL_CLUB: 'Social Clubs',
  PAYMENT: 'Payments',
  WITHDRAWAL: 'Withdrawals',
  HOST_APPLICATION: 'Host applications',
}

/**
 * Cross-entity search (plan.md §2.9).
 *
 * Searches user ID, masked contact, club ID, payment ID and withdrawal
 * reference. Results show masked values only — this is a way to FIND a record,
 * never a way to read a raw phone number off the results list.
 *
 * Every keystroke cancels the previous request via the query signal.
 */
export function GlobalSearch({ className }: { className?: string }) {
  const navigate = useNavigate()
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const enabled = term.trim().length >= 2

  const { data, isFetching } = useQuery({
    queryKey: queryKeys.search(term.trim()),
    queryFn: ({ signal }) =>
      apiClient.get<z.infer<typeof responseSchema>>('/admin/search', {
        params: { q: term.trim() },
        schema: responseSchema,
        resource: 'search results',
        signal,
      }),
    enabled,
    staleTime: 15_000,
  })

  const results = data?.data ?? []

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  function go(result: SearchResult | undefined) {
    if (!result) return
    void navigate(result.href)
    setOpen(false)
    setTerm('')
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!open || results.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + results.length) % results.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      go(results[activeIndex])
    }
  }

  // Group results while preserving the backend's ordering.
  const groups = results.reduce<Map<SearchResult['type'], SearchResult[]>>(
    (map, result) => {
      const bucket = map.get(result.type) ?? []
      bucket.push(result)
      map.set(result.type, bucket)
      return map
    },
    new Map(),
  )

  let flatIndex = -1

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground-subtle"
        aria-hidden="true"
      />
      <Input
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls="global-search-results"
        aria-autocomplete="list"
        placeholder="Search user, club, payment or withdrawal ID"
        aria-label="Global search"
        className="pl-9"
        value={term}
        onChange={(event) => {
          setTerm(event.target.value)
          setActiveIndex(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {open && enabled ? (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute top-full right-0 left-0 z-50 mt-2 max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-surface shadow-md"
        >
          {isFetching && results.length === 0 ? (
            <p className="px-3 py-4 text-caption text-foreground-muted">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-4 text-caption text-foreground-muted">
              No records match “{term.trim()}”.
            </p>
          ) : (
            Array.from(groups.entries()).map(([type, items]) => (
              <div key={type} className="border-b border-border py-1 last:border-b-0">
                <p className="px-3 py-1 text-overline text-foreground-subtle uppercase">
                  {GROUP_LABELS[type]}
                </p>
                {items.map((result) => {
                  flatIndex += 1
                  const index = flatIndex
                  return (
                    <button
                      key={`${result.type}-${result.id}`}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => go(result)}
                      className={cn(
                        'block w-full px-3 py-2 text-left',
                        index === activeIndex
                          ? 'bg-primary-soft'
                          : 'hover:bg-surface-muted',
                      )}
                    >
                      <span className="block truncate text-body font-medium">
                        {result.label}
                      </span>
                      <span className="block truncate text-caption text-foreground-muted">
                        {result.sublabel}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
