import { z } from 'zod'

import {
  currencyCode,
  diamondAmount,
  idSchema,
  isoDateTime,
  minorUnits,
} from './common'

/**
 * Diamond wallet.
 *
 * plan.md §9: available and locked are ALWAYS separate figures. There is
 * deliberately no `total` field — a combined number must never be presented
 * as spendable.
 */
export const diamondWalletSchema = z.object({
  id: idSchema,
  ownerId: idSchema,
  ownerName: z.string(),
  ownerType: z.enum(['USER', 'HOST']),
  availableDiamonds: diamondAmount,
  lockedDiamonds: diamondAmount,
  /** Optimistic concurrency token. */
  version: z.int().nonnegative(),
  updatedAt: isoDateTime,
})
export type DiamondWallet = z.infer<typeof diamondWalletSchema>

export const diamondTransactionTypeSchema = z.enum([
  'PURCHASE_CREDIT',
  'GIFT_DEBIT',
  'GIFT_EARNING_CREDIT',
  'ADJUSTMENT_CREDIT',
  'ADJUSTMENT_DEBIT',
  'WITHDRAWAL_LOCK',
  'WITHDRAWAL_RELEASE',
  'PAYOUT_SETTLEMENT',
])
export type DiamondTransactionType = z.infer<typeof diamondTransactionTypeSchema>

/**
 * An immutable ledger entry.
 *
 * plan.md Diamond Economy: entries are never edited or deleted. A correction
 * is a NEW compensating entry linked via `relatedTransactionId`.
 */
export const diamondTransactionSchema = z.object({
  id: idSchema,
  type: diamondTransactionTypeSchema,
  /** Signed whole Diamonds: negative for a debit. */
  amount: z.int(),
  walletId: idSchema,
  ownerId: idSchema,
  ownerName: z.string(),
  counterpartyId: idSchema.nullable(),
  counterpartyName: z.string().nullable(),
  clubId: idSchema.nullable(),
  relatedTransactionId: idSchema.nullable(),
  idempotencyKey: z.string(),
  correlationId: z.string(),
  createdAt: isoDateTime,
})
export type DiamondTransaction = z.infer<typeof diamondTransactionSchema>

/**
 * A Super Admin-configured commercial offer.
 *
 * plan.md Diamond Economy: this is NOT a live currency conversion. A USD and
 * an EUR package are separate offers with independently set values.
 */
export const diamondPackageSchema = z.object({
  id: idSchema,
  name: z.string(),
  marketCountry: z.string().nullable(),
  currency: currencyCode,
  /** Real-money price in minor units. */
  priceMinorUnits: minorUnits.nonnegative(),
  diamondsGranted: diamondAmount,
  providerProductId: z.string().nullable(),
  active: z.boolean(),
  effectiveFrom: isoDateTime,
  effectiveTo: isoDateTime.nullable(),
  displayOrder: z.int().nonnegative(),
  version: z.int().nonnegative(),
})
export type DiamondPackage = z.infer<typeof diamondPackageSchema>

export const giftSchema = z.object({
  id: idSchema,
  name: z.string(),
  diamondPrice: diamondAmount,
  active: z.boolean(),
  displayOrder: z.int().nonnegative(),
})
export type Gift = z.infer<typeof giftSchema>

/**
 * Host payout configuration.
 *
 * plan.md Diamond Economy: answers a DIFFERENT question from a purchase
 * package — "how much money does a Host receive for eligible earning
 * Diamonds?" — and is configured and stored entirely separately.
 */
export const payoutRateSchema = z.object({
  id: idSchema,
  marketCountry: z.string().nullable(),
  payoutCurrency: currencyCode,
  /** Diamonds that the gross amount corresponds to. */
  eligibleDiamondBasis: diamondAmount,
  grossPayoutMinorUnits: minorUnits.nonnegative(),
  feeType: z.enum(['FIXED', 'PERCENTAGE', 'BOTH']),
  feeFixedMinorUnits: minorUnits.nonnegative(),
  /** Basis points, e.g. 1000 = 10%. Integer to avoid float rates. */
  feePercentageBps: z.int().nonnegative(),
  active: z.boolean(),
  effectiveFrom: isoDateTime,
  effectiveTo: isoDateTime.nullable(),
  version: z.int().nonnegative(),
})
export type PayoutRate = z.infer<typeof payoutRateSchema>
