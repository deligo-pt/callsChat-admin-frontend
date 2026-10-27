import { z } from 'zod'

import {
  countEnvelopeSchema,
  envelopeSchema,
  idSchema,
  isoDateTime,
} from '@/types/common'

/**
 * Diamond Wallet & Creator Economy contracts (plan.md §2, phase W1).
 *
 * MEASURED against `https://test-api.callschat.com/api/v1` on 2026-10-27 with
 * a `SUPER_ADMIN` token. The integration guide is wrong in nine places and the
 * measurement wins every one of them — each is marked below so the next reader
 * does not "fix" the code back toward the document.
 *
 * ⚠️ **Every row shape here is doc-derived.** The live tables hold **zero**
 * top-up requests and **zero** packages, so no row has ever been observed.
 * That is the condition that produced the `suspendedReason` defect in the host
 * module: a schema, a cell and a mock that all agreed with the same guess, and
 * 127 tests that passed while the column read a field the server has never
 * sent. So the rows are permissive — only `id` is required — and the first
 * real record is what closes plan.md O11.
 */

/* -------------------------------------------------------------------------
 * Enums — both measured, both case-SENSITIVE
 * ---------------------------------------------------------------------- */

/**
 * ⚠️ Validated server-side and case-SENSITIVE: `?status=pending` is a `400`
 * (`Invalid enum value. Expected 'PENDING' | 'APPROVED' | 'REJECTED' |
 * 'CANCELLED'`). Unlike `niche` on the host routes, which accepts garbage and
 * silently returns the wrong set.
 */
export const TOP_UP_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const
export const topUpStatusSchema = z.enum(TOP_UP_STATUSES)
export type TopUpStatus = z.infer<typeof topUpStatusSchema>

/**
 * ⚠️ **The guide is wrong in both directions here, and it changes what this
 * screen is.** It documents `BKASH, NAGAD, ROCKET, UPAY, BANK` and frames the
 * queue as manual mobile-money verification. The server's own error message
 * says otherwise:
 *
 *     Expected 'BKASH' | 'NAGAD' | 'ROCKET' | 'BANK' | 'STRIPE' |
 *              'GOOGLE_PLAY' | 'APPLE_IAP', received 'x'
 *
 * `UPAY` **does not exist** — a filter offering it would `400` on click — and
 * the three card/store methods are real and undocumented. So this queue also
 * carries Stripe and app-store purchases, which are not things an operator
 * verifies against a bank statement.
 */
export const PAYMENT_METHODS = [
  'BKASH',
  'NAGAD',
  'ROCKET',
  'BANK',
  'STRIPE',
  'GOOGLE_PLAY',
  'APPLE_IAP',
] as const
export const paymentMethodSchema = z.enum(PAYMENT_METHODS)
export type PaymentMethod = z.infer<typeof paymentMethodSchema>

/** The methods a human reconciles by hand; the rest settle through a gateway. */
export const MANUAL_METHODS: readonly PaymentMethod[] = [
  'BKASH',
  'NAGAD',
  'ROCKET',
  'BANK',
]

export function isManualMethod(method: string | null | undefined): boolean {
  return (MANUAL_METHODS as readonly string[]).includes(method ?? '')
}

/* -------------------------------------------------------------------------
 * Money
 * ---------------------------------------------------------------------- */

/**
 * ⚠️ **Not `minorUnits`.** `amountBdt: 1200` and `priceUsd: 25.0` in the
 * guide's examples are whole currency units, not paisa or cents, and `priceUsd`
 * is a float. Coercing to integers here would silently divide every price by a
 * hundred, and `z.int()` would reject `25.5` outright.
 *
 * Nonnegative rather than positive: a package created at `0` is a mistake we
 * want to render, not a payload we want to reject.
 */
const money = z.number().nonnegative()

/** Whole diamonds. ⚠️ Signed — an adjustment may be a debit (§2.5). */
const diamonds = z.number()

/* -------------------------------------------------------------------------
 * The applicant/payer on a request row
 * ---------------------------------------------------------------------- */

/**
 * ⚠️ Only `id` is required, and `profile` may be absent entirely. The host
 * module learned this the hard way: a real applicant arrived with
 * `profile: null` and no email, and a stricter schema would have blanked the
 * whole row rather than the one missing field.
 */
export const walletUserSchema = z.object({
  id: idSchema,
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  profile: z
    .object({
      displayName: z.string().nullable().optional(),
      username: z.string().nullable().optional(),
      /**
       * ⚠️ A **relative path**, not a URL — `avatars/avatar_cmv5…_179301.jpg`
       * on every live host record measured (plan.md O10). `safeUrl` rejects it
       * as-is, so anything rendering it needs a configured media base.
       */
      avatarUrl: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
})
export type WalletUser = z.infer<typeof walletUserSchema>

/* -------------------------------------------------------------------------
 * Diamond packages
 * ---------------------------------------------------------------------- */

export const diamondPackageSchema = z.object({
  id: idSchema,
  title: z.string().nullable().optional(),
  diamonds: z.number().nullable().optional(),
  bonusDiamonds: z.number().nullable().optional(),
  priceBdt: money.nullable().optional(),
  priceUsd: money.nullable().optional(),
  badgeText: z.string().nullable().optional(),
  sortOrder: z.number().nullable().optional(),
  isActive: z.boolean().nullable().optional(),
  createdAt: isoDateTime.or(z.string()).nullable().optional(),
  updatedAt: isoDateTime.or(z.string()).nullable().optional(),
})
export type DiamondPackage = z.infer<typeof diamondPackageSchema>

/**
 * ⚠️ **No pagination at all.** `GET /admin/wallet/packages` answers
 * `{ success: true, data: [] }` — a bare array, measured. Neither list
 * envelope fits, and forcing one on it would fail every response.
 */
export const diamondPackageListSchema = envelopeSchema(z.array(diamondPackageSchema))

/* -------------------------------------------------------------------------
 * Top-up requests
 * ---------------------------------------------------------------------- */

export const topUpRequestSchema = z.object({
  id: idSchema,
  userId: idSchema.optional(),
  packageId: z.string().nullable().optional(),

  diamonds: z.number().nullable().optional(),
  amountBdt: money.nullable().optional(),

  method: paymentMethodSchema.or(z.string()).nullable().optional(),
  senderNumber: z.string().nullable().optional(),
  transactionId: z.string().nullable().optional(),

  /**
   * ⚠️ **User-submitted media, and the evidence the decision rests on.**
   * Carried as a plain string and never `z.url()`: every comparable URL field
   * on this backend is unvalidated server-side, and rejecting a poisoned value
   * at the contract boundary would blank an entire payment request over one
   * field. It is defused at render instead (plan.md §7), exactly as an
   * applicant's intro sample is.
   */
  receiptImageUrl: z.string().nullable().optional(),

  status: topUpStatusSchema.or(z.string()).nullable().optional(),
  rejectionReason: z.string().nullable().optional(),

  reviewedById: idSchema.or(z.string()).nullable().optional(),
  reviewedAt: isoDateTime.or(z.string()).nullable().optional(),
  createdAt: isoDateTime.or(z.string()).nullable().optional(),
  updatedAt: isoDateTime.or(z.string()).nullable().optional(),

  user: walletUserSchema.nullable().optional(),
  package: diamondPackageSchema.nullable().optional(),
})
export type TopUpRequest = z.infer<typeof topUpRequestSchema>

/**
 * ⚠️ **The guide prints the wrong envelope for this route.** It shows
 * `{ data: [...], pagination: {...} }`. The server sends the counters beside
 * the rows, measured:
 *
 *     { success: true, data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 } }
 *
 * That is `countEnvelopeSchema` with an array key of `items` — the shape
 * `GET /admin/verifications` already uses with the key `requests`. It did not
 * need a new helper, only the right one.
 */
export const topUpRequestListSchema = countEnvelopeSchema(topUpRequestSchema, 'items')

export const topUpRequestDetailSchema = envelopeSchema(topUpRequestSchema)

/* -------------------------------------------------------------------------
 * Writes
 * ---------------------------------------------------------------------- */

/** The server's floor, measured: `body/reason Required`. */
export const MIN_REJECTION_REASON = 1

/**
 * The panel's floor, deliberately higher.
 *
 * ⚠️ This text is shown to the person whose payment was refused, not to an
 * auditor. The server accepts one character; "no" is not an explanation
 * somebody can act on, and the applicant cannot ask a follow-up question.
 */
export const MIN_PANEL_REJECTION_REASON = 10

/** `POST /admin/wallet/adjust` — all three fields required, measured. */
export const adjustWalletSchema = z.object({
  userId: idSchema,
  /** ⚠️ Signed, and **never zero**: `body/amount Amount cannot be zero`. */
  amount: diamonds.refine((value) => value !== 0, 'Amount cannot be zero'),
  note: z.string().min(1),
})
export type AdjustWalletPayload = z.infer<typeof adjustWalletSchema>

/**
 * `POST /admin/wallet/packages`. Measured required set: `title`, `diamonds`,
 * `priceBdt`. The server's own wordings are reused so the panel and the
 * backend cannot disagree about what "invalid" means.
 */
export const createPackageSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  diamonds: z.number().positive('Base diamonds must be positive'),
  bonusDiamonds: z.number().nonnegative().optional(),
  priceBdt: z.number().positive('BDT price must be positive'),
  priceUsd: z.number().positive().nullable().optional(),
  badgeText: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
})
export type CreatePackagePayload = z.infer<typeof createPackageSchema>

/** `PATCH /admin/wallet/packages/:id` — partial, measured. */
export const updatePackageSchema = createPackageSchema.partial()
export type UpdatePackagePayload = z.infer<typeof updatePackageSchema>

/* -------------------------------------------------------------------------
 * Economy settings
 * ---------------------------------------------------------------------- */

/**
 * ⚠️ **Two fields, not the guide's three.** `defaultHostRevenueSharePercent`
 * is documented and **is not in the settings record** — all 25 keys were read
 * on 2026-10-27. Revenue share lives per host, on the profile
 * (`revenueSharePercent: 70`). Treated as absent until measured (plan.md O9).
 *
 * ⚠️ These write the same `id: "primary"` singleton `GET /admin/settings`
 * returns, which `features/settings` already owns.
 */
export const economySettingsSchema = z.object({
  newUserDiamondBonus: z.number().int().nonnegative('Bonus cannot be negative'),
  minCreatorTransferLimit: z.number().int().nonnegative(),
})
export type EconomySettings = z.infer<typeof economySettingsSchema>

export const economySettingsPatchSchema = economySettingsSchema.partial()
export type EconomySettingsPatch = z.infer<typeof economySettingsPatchSchema>

/* -------------------------------------------------------------------------
 * The adjustment form's contract
 * ---------------------------------------------------------------------- */

/**
 * ⚠️ **Here rather than in a feature, because the form lives in
 * `features/users` and the endpoint lives in the diamonds module.** The action
 * moved onto the user record (plan.md §4.2, revised 2026-10-27) — the page it
 * used to have could not show who an opaque `userId` belonged to, and the user
 * detail screen already shows the name, the balances and the restriction
 * history. `eslint.config.js` forbids one feature importing another, so the
 * contract sits beside the schema it belongs to and both features read it from
 * here.
 *
 * ⚠️ **Direction and magnitude are separate fields, and the signed number the
 * API wants is assembled on submit.** `POST /admin/wallet/adjust` takes one
 * signed `amount`, so a single input would have been a thinner form — and a
 * worse one. A minus sign is one keystroke, it is invisible at a glance in a
 * right-aligned numeric field, and losing it turns a 500-diamond clawback into
 * a 500-diamond gift. Splitting them means the dangerous choice is made with a
 * control that names it rather than with punctuation.
 *
 * ⚠️ There is no reversal endpoint. The only way to undo an adjustment is
 * another adjustment in the opposite direction, which is a second permanent
 * ledger row, not a correction.
 */

export const ADJUSTMENT_DIRECTIONS = ['CREDIT', 'DEBIT'] as const
export type AdjustmentDirection = (typeof ADJUSTMENT_DIRECTIONS)[number]

/**
 * ⚠️ The server requires a non-empty `note` and nothing more
 * (`body/note Required`). The panel asks for more, as it does for a rejection
 * reason: this text is the only explanation anyone auditing the ledger will
 * ever see, and "fix" is not one.
 */
export const MIN_ADJUSTMENT_NOTE = 10

export const adjustmentFormSchema = z.object({
  userId: z.string().trim().min(1, 'A user ID is required'),
  direction: z.enum(ADJUSTMENT_DIRECTIONS),
  /*
   * A positive magnitude. The server's own rule is `Amount cannot be zero`;
   * stated here as "more than zero" because with a direction control there is
   * no such thing as a negative magnitude to explain away.
   */
  amount: z
    .string()
    .trim()
    .min(1, 'An amount is required')
    .refine((value) => Number.isFinite(Number(value)), 'Amount must be a number')
    .refine((value) => Number.isInteger(Number(value)), 'Diamonds are whole units')
    .refine((value) => Number(value) > 0, 'Amount must be more than zero'),
  note: z
    .string()
    .trim()
    .min(MIN_ADJUSTMENT_NOTE, `Write at least ${MIN_ADJUSTMENT_NOTE} characters`),
})

export type AdjustmentFormValues = z.infer<typeof adjustmentFormSchema>

export const ADJUSTMENT_FORM_FIELDS = ['userId', 'direction', 'amount', 'note'] as const

export const ADJUSTMENT_FORM_DEFAULTS: AdjustmentFormValues = {
  userId: '',
  direction: 'CREDIT',
  amount: '',
  note: '',
}

/** The signed amount the API receives. */
export function signedAmount(values: {
  direction: AdjustmentDirection
  amount: string
}): number {
  const magnitude = Math.abs(Number(values.amount))
  return values.direction === 'DEBIT' ? -magnitude : magnitude
}

export function buildAdjustPayload(values: AdjustmentFormValues): AdjustWalletPayload {
  return {
    userId: values.userId.trim(),
    amount: signedAmount(values),
    note: values.note.trim(),
  }
}

/** The queue's `limit` ceiling, measured: `limit=101` is a `400`. */
export const MAX_LIST_LIMIT = 100
