import { z } from 'zod'

import { idSchema, isoDateTime, paginationSchema } from '@/types/common'

/**
 * The wallet ledger — every diamond movement on every user's wallet (plan.md
 * §1–§2, phase T1).
 *
 * MEASURED against `https://test-api.callschat.com/api/v1` on 2026-11-01 with
 * a `SUPER_ADMIN` token, GET only: 59 rows across 7 users, re-measured the
 * same day before this file was written. Unlike the wallet module of W1, every
 * shape below has been **seen**, not read from the doc.
 *
 * ✅ The figures are trustworthy: for every user, each row's `balanceAfter`
 * equals the previous one plus `amount`, and the newest equals the detail
 * route's `currentDiamondBalance`.
 */

/* -------------------------------------------------------------------------
 * Enums — validated server-side, case-SENSITIVE
 * ---------------------------------------------------------------------- */

/**
 * Verbatim from the service's own rejection of `?type=x`.
 *
 * ⚠️ `TOP_UP_PURCHASE` is accepted by the validator and absent from the doc
 * (plan.md B4). Only `GIFT_SENT`, `ADMIN_ADJUSTMENT`, `CREATOR_EARNINGS_CONVERT`
 * and `TOP_UP` have been seen on a row.
 */
export const WALLET_TRANSACTION_TYPES = [
  'TOP_UP',
  'TOP_UP_PURCHASE',
  'GIFT_SENT',
  'FRAME_PURCHASE',
  'ADMIN_ADJUSTMENT',
  'REFUND',
  'SIGNUP_BONUS',
  'CREATOR_EARNINGS_CONVERT',
] as const
export const walletTransactionTypeSchema = z.enum(WALLET_TRANSACTION_TYPES)
export type WalletTransactionType = z.infer<typeof walletTransactionTypeSchema>

export function isWalletTransactionType(value: string): value is WalletTransactionType {
  return (WALLET_TRANSACTION_TYPES as readonly string[]).includes(value)
}

export const WALLET_DIRECTIONS = ['CREDIT', 'DEBIT'] as const
export type WalletDirection = (typeof WALLET_DIRECTIONS)[number]

export const WALLET_SORTS = ['desc', 'asc'] as const
export type WalletSort = (typeof WALLET_SORTS)[number]

/** `limit` is bounded server-side: `101` is a `400`. */
export const MAX_WALLET_LIMIT = 100
export const DEFAULT_WALLET_LIMIT = 20

/* -------------------------------------------------------------------------
 * Rows
 * ---------------------------------------------------------------------- */

/**
 * The account a row belongs to. All eight fields arrived on all 59 rows;
 * only `email` was ever null (39 of 59). Kept permissive past `id` anyway — a
 * deleted or half-provisioned account must cost one blank cell, not the page.
 *
 * ⚠️ `status` includes `PENDING_VERIFICATION`, which the doc does not list.
 * ⚠️ `avatarUrl` is a relative storage path, as everywhere else (old O10).
 */
export const walletTransactionUserSchema = z.object({
  id: idSchema,
  displayName: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phoneMasked: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
})
export type WalletTransactionUser = z.infer<typeof walletTransactionUserSchema>

/**
 * One ledger row.
 *
 * - `amount` is **signed**: positive credits, negative debits, and **0** for
 *   a free gift (23 of 59 rows live).
 * - ⚠️ `direction` says `CREDIT` on those zero rows, and the `direction`
 *   filter excludes them from both sides (plan.md B2). Never render it as
 *   sent; read `directionOf(row)`.
 * - `refId` means something different per type (plan.md §1): the top-up
 *   request id, the adjusting admin's user id, a gift **slug**, or a
 *   conversion id. See `sourceOf`.
 * - `type` falls back to the raw string, so a type added server-side renders
 *   as sent rather than failing the page.
 */
export const walletTransactionSchema = z.object({
  id: idSchema,
  userId: z.string(),
  user: walletTransactionUserSchema.nullable().optional(),
  type: walletTransactionTypeSchema.or(z.string()),
  amount: z.number(),
  direction: z.string().nullable().optional(),
  balanceAfter: z.number().nullable().optional(),
  refId: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  createdAt: isoDateTime,
})
export type WalletTransaction = z.infer<typeof walletTransactionSchema>

/**
 * The detail route: the list row, plus the account's balance **now** — so a
 * row can say "balance then 1,500 · now 6,599".
 */
export const walletTransactionDetailSchema = walletTransactionSchema.extend({
  user: walletTransactionUserSchema
    .extend({ currentDiamondBalance: z.number().nullable().optional() })
    .nullable()
    .optional(),
})
export type WalletTransactionDetail = z.infer<typeof walletTransactionDetailSchema>

/**
 * The KPI block on every list response, scoped to the filters.
 *
 * ⚠️ **Except `direction`** (plan.md B3): with `direction=DEBIT`,
 * `totalTransactions` follows the filter but the three Diamond totals do not.
 * Read through `summaryFor`, never directly.
 *
 * `totalVolumeDiamonds` = credit + debit, both as magnitudes.
 */
export const walletSummarySchema = z.object({
  totalTransactions: z.number(),
  totalVolumeDiamonds: z.number(),
  totalCreditDiamonds: z.number(),
  totalDebitDiamonds: z.number(),
})
export type WalletSummary = z.infer<typeof walletSummarySchema>

/** `pagination` here carries `hasMore` beside the usual four. */
export const walletTransactionListSchema = z.object({
  success: z.literal(true),
  data: z.array(walletTransactionSchema),
  pagination: paginationSchema.extend({ hasMore: z.boolean().optional() }),
  summary: walletSummarySchema,
})

export const walletTransactionDetailEnvelopeSchema = z.object({
  success: z.literal(true),
  data: walletTransactionDetailSchema,
})

/* -------------------------------------------------------------------------
 * Reading a row honestly
 * ---------------------------------------------------------------------- */

/**
 * Credit, Debit, or Free — from the **sign**, never from `direction`.
 *
 * ⚠️ plan.md B2: 23 free gifts arrive as `direction: "CREDIT"` with
 * `amount: 0`. Showing them as credits would claim money moved.
 */
export type RowDirection = WalletDirection | 'FREE'

export function directionOf(row: Pick<WalletTransaction, 'amount'>): RowDirection {
  if (row.amount > 0) return 'CREDIT'
  if (row.amount < 0) return 'DEBIT'
  return 'FREE'
}

/**
 * The summary as it should read for the active `direction` filter.
 *
 * ⚠️ plan.md B3: the server's Diamond totals ignore `direction` (the count
 * does not). Filtering to debits therefore leaves the debit total correct —
 * every other filter still applies — and the credit total wrong; the side the
 * filter excludes is zero by definition.
 */
export function summaryFor(
  summary: WalletSummary,
  direction: WalletDirection | undefined,
): WalletSummary {
  if (direction === 'DEBIT') {
    return {
      ...summary,
      totalCreditDiamonds: 0,
      totalVolumeDiamonds: summary.totalDebitDiamonds,
    }
  }
  if (direction === 'CREDIT') {
    return {
      ...summary,
      totalDebitDiamonds: 0,
      totalVolumeDiamonds: summary.totalCreditDiamonds,
    }
  }
  return summary
}

/**
 * Where a row came from, from `refId` — which means something different for
 * each type (plan.md §1, measured).
 *
 * - `TOP_UP` → the top-up request id (all 4 live rows matched an approved
 *   request on `/admin/wallet/requests`).
 * - `ADMIN_ADJUSTMENT` → the **admin's user id** — who made it.
 * - `GIFT_SENT` → the gift **slug** (`gift-heart_icon`), not a gift-ledger row
 *   (plan.md R2), so it can only lead to the sender's gifts.
 * - anything else → an id no admin route reads.
 */
export type WalletSource =
  | { kind: 'topUpRequest'; requestId: string }
  | { kind: 'adjustedBy'; adminId: string }
  | { kind: 'gift'; slug: string }
  | { kind: 'reference'; refId: string }
  | { kind: 'none' }

export function sourceOf(row: Pick<WalletTransaction, 'type' | 'refId'>): WalletSource {
  const refId = row.refId?.trim()
  if (!refId) return { kind: 'none' }
  switch (row.type) {
    /* Not `TOP_UP_PURCHASE`: no such row has been seen, so its `refId` is unknown. */
    case 'TOP_UP':
      return { kind: 'topUpRequest', requestId: refId }
    case 'ADMIN_ADJUSTMENT':
      return { kind: 'adjustedBy', adminId: refId }
    case 'GIFT_SENT':
      return { kind: 'gift', slug: refId }
    default:
      return { kind: 'reference', refId }
  }
}
