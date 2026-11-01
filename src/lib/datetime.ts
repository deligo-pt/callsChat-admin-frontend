/**
 * Date and time display.
 *
 * plan.md §5.4 / §10: timestamps are stored and transported as UTC ISO-8601.
 * The UI renders them in one format, in an explicit timezone, everywhere.
 * Reports and filters must state which timezone they used.
 */

import { formatDistanceToNowStrict, isValid, parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'

/** One format for the whole application. */
const DATE_TIME_FORMAT = 'dd MMM yyyy, HH:mm'
const DATE_FORMAT = 'dd MMM yyyy'
const TIME_FORMAT = 'HH:mm'
const PRECISE_FORMAT = 'dd MMM yyyy, HH:mm:ss'

/** The operator's timezone, resolved once. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

/** Short label shown next to a timestamp, e.g. "UTC" or "GMT+6". */
export function timeZoneLabel(timeZone: string, at: Date = new Date()): string {
  if (timeZone === 'UTC') return 'UTC'
  try {
    return formatInTimeZone(at, timeZone, 'zzz')
  } catch {
    return timeZone
  }
}

function toDate(value: string | Date): Date | null {
  const date = typeof value === 'string' ? parseISO(value) : value
  return isValid(date) ? date : null
}

export interface DateTimeOptions {
  readonly timeZone?: string
  readonly fallback?: string
}

export function formatDateTime(
  value: string | Date | null | undefined,
  { timeZone = 'UTC', fallback = '—' }: DateTimeOptions = {},
): string {
  if (value == null) return fallback
  const date = toDate(value)
  if (!date) return fallback
  return formatInTimeZone(date, timeZone, DATE_TIME_FORMAT)
}

export function formatDate(
  value: string | Date | null | undefined,
  { timeZone = 'UTC', fallback = '—' }: DateTimeOptions = {},
): string {
  if (value == null) return fallback
  const date = toDate(value)
  if (!date) return fallback
  return formatInTimeZone(date, timeZone, DATE_FORMAT)
}

export function formatTime(
  value: string | Date | null | undefined,
  { timeZone = 'UTC', fallback = '—' }: DateTimeOptions = {},
): string {
  if (value == null) return fallback
  const date = toDate(value)
  if (!date) return fallback
  return formatInTimeZone(date, timeZone, TIME_FORMAT)
}

/** Second-precision variant for audit and ledger entries. */
export function formatPrecise(
  value: string | Date | null | undefined,
  { timeZone = 'UTC', fallback = '—' }: DateTimeOptions = {},
): string {
  if (value == null) return fallback
  const date = toDate(value)
  if (!date) return fallback
  return `${formatInTimeZone(date, timeZone, PRECISE_FORMAT)} ${timeZoneLabel(timeZone, date)}`
}

/** "3 hours ago" — shown as a tooltip companion, never as the only value. */
export function formatRelative(
  value: string | Date | null | undefined,
  fallback = '—',
): string {
  if (value == null) return fallback
  const date = toDate(value)
  if (!date) return fallback
  return `${formatDistanceToNowStrict(date, { addSuffix: true })}`
}

/** ISO date (yyyy-MM-dd) for API filter parameters. */
export function toISODate(date: Date): string {
  return formatInTimeZone(date, 'UTC', 'yyyy-MM-dd')
}

/**
 * The Bangladesh calendar day (`yyyy-MM-dd`) an instant falls on — the
 * inverse of `bangladeshDayBounds`. `null` for anything unparseable.
 */
export function bangladeshDay(value: string | Date | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return formatInTimeZone(date, 'Asia/Dhaka', 'yyyy-MM-dd')
}

/** Bangladesh Standard Time: UTC+6 all year, no daylight saving. */
const BANGLADESH_OFFSET_MS = 6 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * A Bangladesh calendar day (`yyyy-MM-dd`) as the UTC instants that bound it,
 * both inclusive — for APIs that take full ISO timestamps only.
 *
 * `2026-10-29` → `2026-10-28T18:00:00.000Z` … `2026-10-29T17:59:59.999Z`.
 *
 * `null` for anything that is not a real day: `2026-02-31` would otherwise
 * roll over to 3 March and filter on a day nobody picked.
 */
export function bangladeshDayBounds(
  day: string,
): { start: string; end: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) return null
  const [, year, month, date] = match.map(Number) as [number, number, number, number]
  const midnightUtc = Date.UTC(year, month - 1, date)
  if (new Date(midnightUtc).toISOString().slice(0, 10) !== day) return null
  const start = midnightUtc - BANGLADESH_OFFSET_MS
  return {
    start: new Date(start).toISOString(),
    end: new Date(start + DAY_MS - 1).toISOString(),
  }
}
