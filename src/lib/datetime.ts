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
