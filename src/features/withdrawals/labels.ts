import type { Withdrawal, WithdrawalStatus } from '@/types/withdrawals'

/** Words and number formats for the withdrawal pages (plan.md W1–W4). */

/** Times are Bangladesh time, as on every other finance page. */
export const WITHDRAWAL_TIME_ZONE = 'Asia/Dhaka'

const BDT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** `৳1,234.50` — taka with two decimals. */
export function formatBdt(value: number): string {
  return `৳${BDT.format(value)}`
}

export const METHOD_LABELS: Record<string, string> = {
  BKASH: 'bKash',
  NAGAD: 'Nagad',
  ROCKET: 'Rocket',
  BANK: 'Bank transfer',
}

export function methodLabel(type: string | null | undefined): string {
  return (type && METHOD_LABELS[type]) || type || 'Unknown method'
}

export const STATUS_LABELS: Record<WithdrawalStatus | 'ALL', string> = {
  ALL: 'All',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  PAID: 'Paid',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
}

/** `•••• 1111` — the list shows only the last four (decision 2). */
export function lastFour(number: string | null | undefined): string {
  const digits = (number ?? '').replace(/\s+/g, '')
  return digits.length > 4 ? `•••• ${digits.slice(-4)}` : digits || '—'
}

export function processedByName(
  row: Pick<Withdrawal, 'processedByAdmin'>,
): string | null {
  const admin = row.processedByAdmin
  if (!admin) return null
  return admin.profile?.displayName?.trim() || admin.email?.trim() || 'An admin'
}

export const SORT_OPTIONS = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'amount:desc', label: 'Largest amount first' },
  { value: 'amount:asc', label: 'Smallest amount first' },
] as const
