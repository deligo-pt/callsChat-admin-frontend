import { fetchWithdrawals, type WithdrawalQuery } from '@/api/withdrawals'
import {
  MAX_WITHDRAWAL_LIMIT,
  withdrawalHostName,
  type Withdrawal,
} from '@/types/withdrawals'

import { methodLabel, processedByName, STATUS_LABELS } from './labels'

/**
 * CSV export of the withdrawals list (plan.md W5).
 *
 * The API has no export endpoint, so the panel pages through the same list the
 * screen shows (100 rows per call, the server's maximum) and builds the file in
 * the browser. Nothing is posted anywhere and nothing reaches the audit log,
 * and the confirm dialog says so.
 *
 * ⚠️ **Account numbers are exported as the last four digits only**, like the
 * list (decision 2). A spreadsheet of full payout numbers is the easiest thing
 * in this panel to leak, and reconciliation needs the TrxID, not the account.
 */

/** Past this many rows the export stops and says so. 50 calls is enough. */
export const EXPORT_ROW_CAP = 5000

const HEADERS = [
  'Request ID',
  'Requested at (UTC)',
  'Status',
  'Host',
  'Host email',
  'Host user ID',
  'Diamonds',
  'Amount BDT',
  'Fee BDT',
  'Net payout BDT',
  'Method',
  'Account holder',
  'Account (last 4)',
  'Bank',
  'TrxID',
  'Processed by',
  'Processed at (UTC)',
  'Paid at (UTC)',
  'Reject reason',
] as const

/**
 * One CSV cell. Quotes as RFC 4180 needs, and defuses formula injection: a
 * host controls their display name and account holder name, and a cell that
 * opens with `=`, `+`, `-`, `@`, tab or CR runs as a formula in Excel.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function last4(number: string | null | undefined): string {
  const digits = (number ?? '').replace(/\s+/g, '')
  return digits.length > 4 ? digits.slice(-4) : digits
}

export function withdrawalCsvRow(row: Withdrawal): string {
  const snap = row.paymentSnapshot
  return [
    row.id,
    row.requestedAt,
    STATUS_LABELS[row.status],
    withdrawalHostName(row),
    row.user?.email,
    row.userId,
    row.amount,
    row.amountBdt.toFixed(2),
    row.feeBdt.toFixed(2),
    row.netAmountBdt.toFixed(2),
    methodLabel(snap.type),
    snap.accountName,
    last4(snap.accountNumber ?? snap.accountNumberMasked),
    snap.bankName,
    row.transactionRef,
    processedByName(row),
    row.processedAt,
    row.paidAt,
    row.rejectReason,
  ]
    .map(csvCell)
    .join(',')
}

export function withdrawalsCsv(rows: readonly Withdrawal[]): string {
  // BOM so Excel reads ৳ and Bangla names as UTF-8.
  return `\uFEFF${[HEADERS.join(','), ...rows.map(withdrawalCsvRow)].join('\r\n')}\r\n`
}

/** Every row matching the query (page and limit ignored), up to the cap. */
export async function fetchAllWithdrawals(
  query: WithdrawalQuery,
): Promise<{ rows: Withdrawal[]; truncated: boolean }> {
  const rows: Withdrawal[] = []
  for (let page = 1; rows.length < EXPORT_ROW_CAP; page += 1) {
    const result = await fetchWithdrawals({
      ...query,
      page,
      limit: MAX_WITHDRAWAL_LIMIT,
    })
    rows.push(...result.data)
    if (result.data.length === 0 || page >= result.pagination.totalPages) {
      return { rows, truncated: false }
    }
  }
  return { rows: rows.slice(0, EXPORT_ROW_CAP), truncated: true }
}

export function saveCsv(csv: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}
