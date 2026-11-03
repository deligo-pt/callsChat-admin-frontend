import { humaniseEnum } from '@/lib/status'
import {
  WALLET_TRANSACTION_TYPES,
  type WalletTransactionType,
} from '@/types/walletTransactions'

/**
 * How a wallet entry is described in words — shared by the wallet ledger and
 * the user record's Finance tab (plan.md T2–T4).
 */

/**
 * ⚠️ **Bangladesh time, not the panel's usual UTC.** The ledger's date filter
 * works in Bangladesh calendar days, so a row at 19:00 UTC on 28 Oct is *in*
 * "29 Oct". Showing it as 28 Oct would make the filter look wrong.
 */
export const LEDGER_TIME_ZONE = 'Asia/Dhaka'

/**
 * What each type is called on screen (plan.md T2).
 *
 * ⚠️ `TOP_UP_PURCHASE` is real but undocumented (plan.md B4) and has never
 * been seen on a row; it is labelled so the filter can offer it.
 */
export const TYPE_LABELS: Readonly<Record<WalletTransactionType, string>> = {
  TOP_UP: 'Top-up',
  TOP_UP_PURCHASE: 'Top-up purchase',
  GIFT_SENT: 'Gift sent',
  FRAME_PURCHASE: 'Frame purchase',
  ADMIN_ADJUSTMENT: 'Adjustment',
  REFUND: 'Refund',
  SIGNUP_BONUS: 'Sign-up bonus',
  CREATOR_EARNINGS_CONVERT: 'Earnings converted',
}

/** A type the server added after this was written renders readably, not raw. */
export function typeLabel(type: string): string {
  return (TYPE_LABELS as Record<string, string>)[type] ?? humaniseEnum(type)
}

export const TYPE_OPTIONS = WALLET_TRANSACTION_TYPES.map((value) => ({
  value,
  label: TYPE_LABELS[value],
}))

/**
 * A gift's name from the slug the ledger keeps as `refId` (plan.md R2):
 * `gift-heart_icon` → "Heart Icon". The slug is all the row holds — the
 * catalog has no slug field to look it up by — and the server builds it from
 * the name, so this reads it back the same way the row's note does
 * ("Sent 99x Heart Icon").
 */
export function giftName(slug: string): string {
  const words = slug
    .replace(/^gift[-_]/i, '')
    .split(/[-_\s]+/)
    .filter(Boolean)
  if (words.length === 0) return 'Gift'
  return words.map((word) => word[0]!.toUpperCase() + word.slice(1)).join(' ')
}

/**
 * Where a movement with an opaque `refId` came from, in words. The id itself
 * means nothing to an operator, so it is not shown.
 */
const REFERENCE_SOURCES: Readonly<Partial<Record<string, string>>> = {
  CREATOR_EARNINGS_CONVERT: 'Creator Studio',
  TOP_UP_PURCHASE: 'Top-up purchase',
  FRAME_PURCHASE: 'Frame shop',
  REFUND: 'Refund',
  SIGNUP_BONUS: 'Sign-up bonus',
}

export function referenceSource(type: string): string {
  return REFERENCE_SOURCES[type] ?? typeLabel(type)
}

const METHOD_NAMES: Readonly<Record<string, string>> = {
  BKASH: 'bKash',
  NAGAD: 'Nagad',
  ROCKET: 'Rocket',
}

/**
 * The payment method of a top-up, from the note the server writes on it:
 * "Manual top-up via BKASH (TrxID: …)" → "bKash". `null` when the note does
 * not say — the source then reads "Top-up request" alone.
 */
export function methodOf(note: string | null | undefined): string | null {
  return methodName(note?.match(/\bvia\s+([A-Za-z]+)/)?.[1])
}

/** A payment method as people write it: `BKASH` → "bKash". */
export function methodName(raw: string | null | undefined): string | null {
  const method = raw?.trim().toUpperCase().replace(/_/g, ' ')
  if (!method) return null
  return METHOD_NAMES[method] ?? method[0] + method.slice(1).toLowerCase()
}

/**
 * The payment's transaction id, from the note the server writes on a top-up:
 * "Manual top-up via BKASH (TrxID: C6H TSTARA)" → "C6H TSTARA". It may hold a
 * space, so it runs to the closing bracket. `null` when the note has none.
 */
export function trxIdOf(note: string | null | undefined): string | null {
  return note?.match(/TrxID:\s*([^)]+?)\s*\)/)?.[1] ?? null
}
