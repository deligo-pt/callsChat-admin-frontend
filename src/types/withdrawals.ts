import { z } from 'zod'

import { idSchema, isoDateTime, paginationSchema } from '@/types/common'

/**
 * Host withdrawals — `/admin/withdrawals/*` and `/admin/withdrawal-settings`
 * (plan.md §0, phase W0).
 *
 * Measured on staging 2026-11-04. Where the guide and the server disagree,
 * these schemas follow the server:
 * - stats are nested per status, not flat `pendingCount` fields;
 * - list amounts in BDT are **strings** (`"10"`), stats and settings numbers;
 * - `user.profile` has no `username`, and `avatarUrl` is a storage key;
 * - the detail has a `host` block but no KYC and no audit history;
 * - `paymentSnapshot.accountNumber` is the full, unmasked number.
 */

export const WITHDRAWAL_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'PAID',
  'CANCELLED',
] as const
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number]

export const PAYOUT_METHODS = ['BKASH', 'NAGAD', 'ROCKET', 'BANK'] as const
export type PayoutMethod = (typeof PAYOUT_METHODS)[number]

/** `sortBy` values the API accepts — anything else is a 400. */
export const WITHDRAWAL_SORTS = ['createdAt', 'amount', 'amountBdt', 'status'] as const
export type WithdrawalSort = (typeof WITHDRAWAL_SORTS)[number]

/** `limit` above 100 is a 400 (measured). */
export const MAX_WITHDRAWAL_LIMIT = 100

/* Server validation limits, measured from the 400 messages. */
export const REJECT_REASON_MIN = 3
export const REJECT_REASON_MAX = 500
export const ADMIN_NOTE_MAX = 500
export const TRANSACTION_REF_MIN = 3
export const TRANSACTION_REF_MAX = 150

/**
 * BDT as the server sends it: a decimal string on rows, a number elsewhere.
 * Parsed strictly — a value that is neither is a contract break, not a zero.
 */
export const bdtSchema = z
  .union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)])
  .transform((value) => (typeof value === 'number' ? value : Number(value)))

const profileSchema = z.object({
  displayName: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
})

const withdrawalUserSchema = z.object({
  id: idSchema,
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  createdAt: isoDateTime.nullable().optional(),
  profile: profileSchema.nullable().optional(),
})

export const paymentSnapshotSchema = z
  .object({
    type: z.string(),
    accountName: z.string().nullable().optional(),
    accountNumber: z.string().nullable().optional(),
    accountNumberMasked: z.string().nullable().optional(),
    bankName: z.string().nullable().optional(),
    branchName: z.string().nullable().optional(),
    routingNumber: z.string().nullable().optional(),
    paymentDetailId: z.string().nullable().optional(),
  })
  .loose()
export type PaymentSnapshot = z.infer<typeof paymentSnapshotSchema>

const paymentDetailSchema = z
  .object({
    id: idSchema,
    type: z.string(),
    accountName: z.string().nullable().optional(),
    accountNumber: z.string().nullable().optional(),
    bankName: z.string().nullable().optional(),
    branchName: z.string().nullable().optional(),
    routingNumber: z.string().nullable().optional(),
    isDefault: z.boolean().optional(),
    deletedAt: isoDateTime.nullable().optional(),
  })
  .loose()

const processedBySchema = z
  .object({
    id: idSchema,
    email: z.string().nullable().optional(),
    profile: z
      .object({ displayName: z.string().nullable().optional() })
      .nullable()
      .optional(),
  })
  .nullable()
  .optional()

export const withdrawalSchema = z.object({
  id: idSchema,
  userId: idSchema,
  hostProfileId: z.string().nullable().optional(),
  paymentDetailId: z.string().nullable().optional(),
  paymentSnapshot: paymentSnapshotSchema,
  amount: z.int().nonnegative(),
  amountBdt: bdtSchema,
  feeBdt: bdtSchema,
  netAmountBdt: bdtSchema,
  status: z.enum(WITHDRAWAL_STATUSES),
  userNote: z.string().nullable().optional(),
  adminNote: z.string().nullable().optional(),
  rejectReason: z.string().nullable().optional(),
  transactionRef: z.string().nullable().optional(),
  processedByAdminId: z.string().nullable().optional(),
  requestedAt: isoDateTime,
  processedAt: isoDateTime.nullable().optional(),
  paidAt: isoDateTime.nullable().optional(),
  createdAt: isoDateTime.optional(),
  updatedAt: isoDateTime.optional(),
  user: withdrawalUserSchema.nullable().optional(),
  paymentDetail: paymentDetailSchema.nullable().optional(),
  processedByAdmin: processedBySchema,
})
export type Withdrawal = z.infer<typeof withdrawalSchema>

const hostSchema = z
  .object({
    id: idSchema,
    level: z.number().nullable().optional(),
    badgeLevel: z.number().nullable().optional(),
    status: z.string().nullable().optional(),
    withdrawableDiamonds: z.number().nullable().optional(),
    pendingWithdrawal: z.number().nullable().optional(),
    totalDiamondsEarned: z.number().nullable().optional(),
  })
  .nullable()
  .optional()

export const withdrawalDetailSchema = withdrawalSchema.extend({ host: hostSchema })
export type WithdrawalDetail = z.infer<typeof withdrawalDetailSchema>

export const withdrawalListSchema = z.object({
  success: z.literal(true),
  data: z.array(withdrawalSchema),
  pagination: paginationSchema.extend({ hasMore: z.boolean().optional() }),
})

export const withdrawalDetailEnvelopeSchema = z.object({
  success: z.literal(true),
  data: withdrawalDetailSchema,
})

const bucketSchema = z.object({
  count: z.int().nonnegative(),
  diamonds: z.number(),
  amountBdt: bdtSchema,
})
export type WithdrawalBucket = z.infer<typeof bucketSchema>

export const withdrawalStatsSchema = z.object({
  totalRequests: z.int().nonnegative(),
  totalDiamonds: z.number(),
  totalAmountBdt: bdtSchema,
  pending: bucketSchema,
  approved: bucketSchema,
  paid: bucketSchema,
  rejected: bucketSchema,
  cancelled: bucketSchema,
})
export type WithdrawalStats = z.infer<typeof withdrawalStatsSchema>

export const withdrawalStatsEnvelopeSchema = z.object({
  success: z.literal(true),
  data: withdrawalStatsSchema,
})

/** The writes answer `{ success, message, data }`; the panel reads `message`. */
export const withdrawalWriteEnvelopeSchema = z
  .object({
    success: z.literal(true),
    message: z.string().optional(),
    data: z.unknown().optional(),
  })
  .loose()

export const withdrawalSettingsSchema = z.object({
  id: z.string().optional(),
  minAmount: z.number(),
  maxAmount: z.number(),
  conversionRate: bdtSchema,
  feePercent: bdtSchema,
  feeFlat: bdtSchema,
  maxPaymentDetailsPerUser: z.number(),
  withdrawalsEnabled: z.boolean(),
  updatedAt: isoDateTime.nullable().optional(),
  updatedBy: z.string().nullable().optional(),
})
export type WithdrawalSettings = z.infer<typeof withdrawalSettingsSchema>

export const withdrawalSettingsEnvelopeSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: withdrawalSettingsSchema,
})

export type WithdrawalSettingsPatch = Partial<
  Pick<
    WithdrawalSettings,
    | 'minAmount'
    | 'maxAmount'
    | 'conversionRate'
    | 'feePercent'
    | 'feeFlat'
    | 'maxPaymentDetailsPerUser'
    | 'withdrawalsEnabled'
  >
>

/* ------------------------------------------------------------------ *
 * Helpers shared by the pages
 * ------------------------------------------------------------------ */

export function isWithdrawalStatus(
  value: string | null | undefined,
): value is WithdrawalStatus {
  return (
    typeof value === 'string' &&
    (WITHDRAWAL_STATUSES as readonly string[]).includes(value)
  )
}

export function withdrawalHostName(row: Pick<Withdrawal, 'user'>): string {
  return (
    row.user?.profile?.displayName?.trim() ||
    row.user?.profile?.username?.trim() ||
    row.user?.email?.trim() ||
    'Unknown host'
  )
}

/** What may be done to a request in this state, per the guide's state machine. */
export function allowedActions(status: WithdrawalStatus) {
  return {
    approve: status === 'PENDING',
    reject: status === 'PENDING' || status === 'APPROVED',
    markPaid: status === 'APPROVED',
  }
}

/**
 * Do two names plausibly belong to one person? Advisory only (plan.md §1.5):
 * true when they share any word of 2+ letters, ignoring case and punctuation.
 */
export function namesLookAlike(
  a: string | null | undefined,
  b: string | null | undefined,
) {
  const words = (value: string | null | undefined) =>
    new Set(
      (value ?? '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(
          (word) => word.length >= 2 && !['md', 'mr', 'mrs', 'ms'].includes(word),
        ),
    )
  const left = words(a)
  const right = words(b)
  if (left.size === 0 || right.size === 0) return true
  for (const word of left) if (right.has(word)) return true
  return false
}

/** Gross, fee and net in BDT for a diamond amount, as the server computes them. */
export function previewPayout(
  diamonds: number,
  settings: Pick<WithdrawalSettings, 'conversionRate' | 'feePercent' | 'feeFlat'>,
) {
  const round = (value: number) => Math.round(value * 100) / 100
  const gross = round(diamonds * settings.conversionRate)
  const fee = round((gross * settings.feePercent) / 100 + settings.feeFlat)
  return { gross, fee, net: round(gross - fee) }
}
