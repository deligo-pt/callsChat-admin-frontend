import { parseFieldErrors } from '@/types/common'
import { RATE_LIMIT_FIELDS, type RateLimitKey } from '@/types/settings'

/**
 * Labels, units and hints for the eight rate-limit fields (plan.md RL1).
 *
 * Ranges come from `RATE_LIMIT_FIELDS`, which were measured on the server —
 * never restated here, so the hint and the check can never disagree.
 */
export interface RateLimitFieldCopy {
  readonly key: RateLimitKey
  readonly label: string
  /** Shown inside the input, after the number. */
  readonly unit: string
  readonly hint: string
}

export type RateLimitGroup = 'otp' | 'traffic'

/** Pairs: each value sits beside its window from `md` up. */
export const RATE_LIMIT_GROUPS: Readonly<
  Record<RateLimitGroup, readonly RateLimitFieldCopy[]>
> = {
  otp: [
    {
      key: 'otpCooldownSeconds',
      label: 'Resend cooldown',
      unit: 'seconds',
      hint: 'Wait before the same phone gets another code.',
    },
    {
      key: 'otpMaxAttempts',
      label: 'Max wrong attempts',
      unit: 'attempts',
      hint: 'Wrong codes allowed before the code stops working.',
    },
    {
      key: 'otpQuotaPerWindow',
      label: 'Codes per phone',
      unit: 'codes',
      hint: 'Most codes one phone gets per quota window.',
    },
    {
      key: 'otpQuotaWindowMinutes',
      label: 'Quota window',
      unit: 'minutes',
      hint: 'The rolling window the code limit counts over.',
    },
  ],
  traffic: [
    {
      key: 'globalRateLimitMax',
      label: 'General API limit',
      unit: 'requests',
      hint: 'Requests per IP to chat, calls, feed and contacts.',
    },
    {
      key: 'globalRateLimitWindowSeconds',
      label: 'General limit window',
      unit: 'seconds',
      hint: 'The window the general limit counts over.',
    },
    {
      key: 'authRateLimitMax',
      label: 'Sign-in limit',
      unit: 'requests',
      hint: 'Tries on sign-in, sign-up and token refresh.',
    },
    {
      key: 'authRateLimitWindowSeconds',
      label: 'Sign-in limit window',
      unit: 'seconds',
      hint: 'The window the sign-in limit counts over.',
    },
  ],
}

export function rangeHint(key: RateLimitKey, unit: string): string {
  const { min, max } = RATE_LIMIT_FIELDS[key]
  return `${min.toLocaleString()}–${max.toLocaleString()} ${unit}.`
}

/**
 * The client check, mirroring the server's.
 *
 * ⚠️ Whole numbers only: the server refuses `9.5` and `"9"` alike, so the
 * input is parsed here and sent as an integer.
 */
export function validateRateLimit(key: RateLimitKey, raw: string): string | null {
  const text = raw.trim()
  if (text === '') return 'Enter a value.'
  if (!/^\d+$/.test(text)) return 'Enter a whole number.'
  const value = Number(text)
  const { min, max } = RATE_LIMIT_FIELDS[key]
  if (value < min) return `The lowest allowed is ${min.toLocaleString()}.`
  if (value > max) return `The highest allowed is ${max.toLocaleString()}.`
  return null
}

/**
 * Server failures for the given fields, keyed by field.
 *
 * The message is `body/<field> <text>`, comma-joined when several fail —
 * `parseFieldErrors` splits both shapes.
 */
export function serverFieldErrors(
  message: string,
  keys: readonly RateLimitKey[],
): Partial<Record<RateLimitKey, string>> {
  const out: Partial<Record<RateLimitKey, string>> = {}
  for (const error of parseFieldErrors(message)) {
    if ((keys as readonly string[]).includes(error.field)) {
      out[error.field as RateLimitKey] = error.message
    }
  }
  return out
}
