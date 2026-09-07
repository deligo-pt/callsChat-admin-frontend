import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SORT_BY,
  DEFAULT_SORT_ORDER,
  FILTER_KEYS,
  MAX_LIMIT,
  isSortableField,
  isValidFilterDate,
  sanitiseFilters,
} from './listParams'

/**
 * The queue's URL contract.
 *
 * Two traps meet here, and they pull in opposite directions — which is the
 * whole reason this module exists rather than the hook parsing the URL inline.
 *
 * - A bad **date** is dropped because the API would *accept* it and silently
 *   return an unfiltered page (§3.7). A 200 is not proof a filter was applied.
 * - A bad **enum** is dropped because the API would *refuse* it with a 400 and
 *   take the whole page down with it.
 */

describe('isValidFilterDate', () => {
  it('accepts a real calendar day', () => {
    expect(isValidFilterDate('2026-09-06')).toBe(true)
    expect(isValidFilterDate('2024-02-29')).toBe(true)
  })

  it('rejects the exact value the API would accept and ignore', () => {
    /*
     * ⚠️ The §3.7 regression test. `?fromDate=yesterday` answered 200 live,
     * with the filter silently dropped. If this ever returns true, the queue
     * starts showing an unfiltered page while displaying a date chip.
     */
    expect(isValidFilterDate('yesterday')).toBe(false)
    expect(isValidFilterDate('notadate')).toBe(false)
  })

  it('rejects an impossible day, not merely a malformed one', () => {
    // A regex-only check passes both of these; `z.iso.date()` does not.
    expect(isValidFilterDate('2026-13-01')).toBe(false)
    expect(isValidFilterDate('2026-02-30')).toBe(false)
  })

  it('rejects a timestamp, because the range is day-granular', () => {
    expect(isValidFilterDate('2026-09-06T10:00:00Z')).toBe(false)
  })

  it('rejects empty, whitespace, null and undefined', () => {
    expect(isValidFilterDate('')).toBe(false)
    expect(isValidFilterDate('   ')).toBe(false)
    expect(isValidFilterDate(null)).toBe(false)
    expect(isValidFilterDate(undefined)).toBe(false)
  })
})

describe('sanitiseFilters', () => {
  it('keeps every legal enum value', () => {
    expect(
      sanitiseFilters({
        status: 'REOPENED',
        type: 'REPORT',
        priority: 'CRITICAL',
        search: 'crash on join',
      }),
    ).toEqual({
      status: 'REOPENED',
      type: 'REPORT',
      priority: 'CRITICAL',
      search: 'crash on join',
    })
  })

  it('drops a value the API would 400 on', () => {
    /*
     * `status`, `type` and `priority` are validated strictly — an unknown
     * value is a 400 naming the legal ones. A pasted URL carrying one would
     * otherwise take the whole queue down instead of rendering it unfiltered.
     */
    expect(sanitiseFilters({ status: 'ARCHIVED' })).toEqual({})
    expect(sanitiseFilters({ type: 'FEATURE' })).toEqual({})
    expect(sanitiseFilters({ priority: 'URGENT' })).toEqual({})
  })

  it('is case-sensitive, matching the API', () => {
    // The enum is upper-case on the wire; `pending` is not a synonym.
    expect(sanitiseFilters({ status: 'pending' })).toEqual({})
  })

  it('never drops a search term, because search is free text', () => {
    expect(sanitiseFilters({ search: 'ARCHIVED' })).toEqual({ search: 'ARCHIVED' })
  })

  it('keeps the good half of a mixed set', () => {
    expect(sanitiseFilters({ status: 'PENDING', priority: 'URGENT' })).toEqual({
      status: 'PENDING',
    })
  })
})

describe('isSortableField', () => {
  it('accepts exactly the API’s four fields', () => {
    for (const field of ['createdAt', 'updatedAt', 'priority', 'status']) {
      expect(isSortableField(field)).toBe(true)
    }
  })

  it('rejects fields the queue renders but cannot sort on', () => {
    /*
     * The columns exist; the sort does not. `subject` and `reporter` are
     * plausible-looking guesses that would 400 — hence the allowlist rather
     * than passing the column id straight through.
     */
    expect(isSortableField('subject')).toBe(false)
    expect(isSortableField('reporter')).toBe(false)
    expect(isSortableField('assignee')).toBe(false)
    expect(isSortableField('activity')).toBe(false)
  })
})

describe('constants', () => {
  it('opens on priority descending — most urgent first', () => {
    expect(DEFAULT_SORT_BY).toBe('priority')
    expect(DEFAULT_SORT_ORDER).toBe('desc')
    expect(isSortableField(DEFAULT_SORT_BY)).toBe(true)
  })

  it('clamps at the limit the API enforces', () => {
    expect(MAX_LIMIT).toBe(100)
  })

  it('offers no assignee filter, because the API has no unassigned value', () => {
    /*
     * §3.6: `assignedAdminId=null` is compared as the literal string and
     * matches nothing. The column shows the state; the filter bar does not
     * offer it. This asserts the absence deliberately, so re-adding it is a
     * decision rather than an oversight.
     */
    expect(FILTER_KEYS).not.toContain('assignedAdminId')
    expect(FILTER_KEYS).toEqual(['search', 'status', 'type', 'priority'])
  })
})
