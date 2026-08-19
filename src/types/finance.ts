import { z } from 'zod'

import {
  currencyCode,
  diamondAmount,
  idSchema,
  isoDateTime,
  minorUnits,
} from './common'

export const paymentStatusSchema = z.enum([
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'REFUNDED',
  'CHARGEBACK',
])
export type PaymentStatus = z.infer<typeof paymentStatusSchema>

/**
 * Immutable snapshot of the package as purchased.
 *
 * plan.md Diamond Economy: changing a package later affects new purchases
 * only — it must never rewrite an old one.
 */
export const packageSnapshotSchema = z.object({
  packageId: idSchema,
  packageVersion: z.int().nonnegative(),
  name: z.string(),
  currency: currencyCode,
  priceMinorUnits: minorUnits.nonnegative(),
  diamondsGranted: diamondAmount,
})
export type PackageSnapshot = z.infer<typeof packageSnapshotSchema>

export const paymentTransactionSchema = z.object({
  id: idSchema,
  userId: idSchema,
  userName: z.string(),
  provider: z.string(),
  /** Provider reference only — raw card data is never stored or displayed. */
  providerReference: z.string(),
  packageSnapshot: packageSnapshotSchema,
  amountMinorUnits: minorUnits,
  currency: currencyCode,
  status: paymentStatusSchema,
  attemptCount: z.int().nonnegative(),
  webhookEventId: z.string().nullable(),
  failureReason: z.string().nullable(),
  reconciled: z.boolean(),
  createdAt: isoDateTime,
  processedAt: isoDateTime.nullable(),
})
export type PaymentTransaction = z.infer<typeof paymentTransactionSchema>

/**
 * Provider-agnostic payout profile.
 *
 * plan.md Payment & Withdrawal: `stripe_account_id` / `paypal_email` are
 * deliberately NOT the model. The Admin Panel sees a provider key, a method
 * type and a masked reference — never raw provider credentials.
 */
export const payoutProfileSchema = z.object({
  id: idSchema,
  providerKey: z.string(),
  methodType: z.string(),
  country: z.string(),
  currency: currencyCode,
  maskedReference: z.string(),
  verificationStatus: z.enum(['UNVERIFIED', 'PENDING', 'VERIFIED', 'UNAVAILABLE']),
})
export type PayoutProfile = z.infer<typeof payoutProfileSchema>

export const withdrawalStateSchema = z.enum([
  'PENDING',
  'UNDER_REVIEW',
  'APPROVED',
  'PROCESSING',
  'COMPLETED',
  'REJECTED',
  'FAILED',
])
export type WithdrawalState = z.infer<typeof withdrawalStateSchema>

/**
 * Snapshot of the payout calculation at request time.
 *
 * plan.md §3.3 / §8B: every value here is computed by the backend. The UI
 * displays them and must never derive, recompute or edit them.
 */
export const payoutCalculationSchema = z.object({
  payoutRateId: idSchema,
  payoutRateVersion: z.int().nonnegative(),
  requestedDiamonds: diamondAmount,
  grossMinorUnits: minorUnits.nonnegative(),
  feeMinorUnits: minorUnits.nonnegative(),
  netMinorUnits: minorUnits.nonnegative(),
  currency: currencyCode,
  appliedAt: isoDateTime,
})
export type PayoutCalculation = z.infer<typeof payoutCalculationSchema>

export const withdrawalReviewEventSchema = z.object({
  id: idSchema,
  fromState: withdrawalStateSchema.nullable(),
  toState: withdrawalStateSchema,
  reviewerName: z.string(),
  reason: z.string().nullable(),
  occurredAt: isoDateTime,
})
export type WithdrawalReviewEvent = z.infer<typeof withdrawalReviewEventSchema>

export const withdrawalSummarySchema = z.object({
  id: idSchema,
  reference: z.string(),
  hostId: idSchema,
  hostName: z.string(),
  state: withdrawalStateSchema,
  requestedDiamonds: diamondAmount,
  lockedDiamonds: diamondAmount,
  calculation: payoutCalculationSchema,
  payoutProfile: payoutProfileSchema,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type WithdrawalSummary = z.infer<typeof withdrawalSummarySchema>

export const withdrawalDetailSchema = withdrawalSummarySchema.extend({
  hostAccountStatus: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED']),
  hostActiveRestrictionCount: z.int().nonnegative(),
  previousWithdrawalCount: z.int().nonnegative(),
  payoutReference: z.string().nullable(),
  failureEvidence: z.string().nullable(),
  reviewHistory: z.array(withdrawalReviewEventSchema),
  linkedTransactionIds: z.array(idSchema),
  /**
   * The backend decides which transitions are legal from the current state.
   * plan.md §8B: the frontend renders these and never hard-codes the graph.
   */
  availableActions: z.array(withdrawalStateSchema),
})
export type WithdrawalDetail = z.infer<typeof withdrawalDetailSchema>
