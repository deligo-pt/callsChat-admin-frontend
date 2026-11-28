import type { RateLimitSettings } from '@/types/settings'

import type { RateLimitGroup } from './fields'

/**
 * Plain-language summaries, warnings and the lockout check (plan.md RL2).
 *
 * Pure functions of the eight values, so the wording the operator reads and
 * the rule that opens the confirm step can never disagree.
 */

/**
 * Below these, a save that **tightens** traffic limits asks first. Admin
 * routes and admin sign-in count against the same limits (plan.md O4), and the
 * general limit is per IP — an office sharing one address shares it.
 */
export const SAFE_GENERAL_PER_MINUTE = 60
export const SAFE_AUTH_PER_MINUTE = 5

/** Below this cooldown, or above this quota, OTP cost exposure is flagged. */
export const LOOSE_COOLDOWN_SECONDS = 30
export const LOOSE_QUOTA = 10

export function perMinute(max: number, windowSeconds: number): number {
  return (max / windowSeconds) * 60
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}

/** `90` → "1 minute 30 seconds", `3600` → "1 hour". */
export function duration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const parts = [
    h ? plural(h, 'hour') : null,
    m ? plural(m, 'minute') : null,
    s ? plural(s, 'second') : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' ') : '0 seconds'
}

function rate(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return rounded.toLocaleString()
}

export function summary(group: RateLimitGroup, v: RateLimitSettings): string {
  if (group === 'otp') {
    return (
      `Each phone can get ${plural(v.otpQuotaPerWindow, 'code')} every ` +
      `${duration(v.otpQuotaWindowMinutes * 60)}, at least ` +
      `${duration(v.otpCooldownSeconds)} apart. ` +
      `${plural(v.otpMaxAttempts, 'wrong try', 'wrong tries')} and a code stops working.`
    )
  }
  const general = perMinute(v.globalRateLimitMax, v.globalRateLimitWindowSeconds)
  const auth = perMinute(v.authRateLimitMax, v.authRateLimitWindowSeconds)
  return (
    `Each IP address can make ${plural(v.globalRateLimitMax, 'request')} every ` +
    `${duration(v.globalRateLimitWindowSeconds)} (about ${rate(general)} a minute), and ` +
    `${plural(v.authRateLimitMax, 'sign-in attempt')} every ` +
    `${duration(v.authRateLimitWindowSeconds)} (about ${rate(auth)} a minute).`
  )
}

/** Inline warnings. They never block a save. */
export function warnings(group: RateLimitGroup, v: RateLimitSettings): string[] {
  const out: string[] = []
  if (group === 'otp') {
    /*
     * Sending N codes takes (N − 1) cooldowns. If that is longer than the
     * window, the last codes of the quota can never be sent.
     */
    const reachable =
      Math.floor((v.otpQuotaWindowMinutes * 60) / v.otpCooldownSeconds) + 1
    if (reachable < v.otpQuotaPerWindow) {
      out.push(
        `With codes ${duration(v.otpCooldownSeconds)} apart, a phone can only get ` +
          `${plural(reachable, 'code')} in ${duration(v.otpQuotaWindowMinutes * 60)} — ` +
          `the quota of ${v.otpQuotaPerWindow.toLocaleString()} can never be reached.`,
      )
    }
    if (
      v.otpCooldownSeconds < LOOSE_COOLDOWN_SECONDS ||
      v.otpQuotaPerWindow > LOOSE_QUOTA
    ) {
      out.push(
        'These limits are loose: more codes can be sent to one phone, which raises SMS cost exposure.',
      )
    }
    return out
  }
  if (
    perMinute(v.globalRateLimitMax, v.globalRateLimitWindowSeconds) <
    SAFE_GENERAL_PER_MINUTE
  ) {
    out.push(
      `Under ${SAFE_GENERAL_PER_MINUTE} requests a minute. This limit is per IP and includes this admin panel — admins on one office network share it.`,
    )
  }
  if (
    perMinute(v.authRateLimitMax, v.authRateLimitWindowSeconds) < SAFE_AUTH_PER_MINUTE
  ) {
    out.push(
      `Under ${SAFE_AUTH_PER_MINUTE} sign-in attempts a minute. Admins signing in to this panel count against it too.`,
    )
  }
  return out
}

/**
 * Whether a save needs the confirm step: it **tightens** a traffic limit to
 * below its safe rate. Loosening an already-low limit never asks — that is
 * the way out of a lockout, and must not be made harder.
 */
export function needsLockoutConfirm(
  before: RateLimitSettings,
  after: RateLimitSettings,
): boolean {
  const gBefore = perMinute(
    before.globalRateLimitMax,
    before.globalRateLimitWindowSeconds,
  )
  const gAfter = perMinute(after.globalRateLimitMax, after.globalRateLimitWindowSeconds)
  const aBefore = perMinute(before.authRateLimitMax, before.authRateLimitWindowSeconds)
  const aAfter = perMinute(after.authRateLimitMax, after.authRateLimitWindowSeconds)
  return (
    (gAfter < gBefore && gAfter < SAFE_GENERAL_PER_MINUTE) ||
    (aAfter < aBefore && aAfter < SAFE_AUTH_PER_MINUTE)
  )
}
