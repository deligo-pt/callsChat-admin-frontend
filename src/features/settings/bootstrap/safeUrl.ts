import { BOOTSTRAP_URL_PROTOCOL } from '@/types/bootstrap'

/**
 * The only thing permitted to turn a stored bootstrap URL into an `href`
 * (plan.md §3.2).
 *
 * ⚠️ `storeUrl`, `privacyPolicyUrl` and `termsUrl` are **not validated by the
 * server**. Verified 2026-09-28:
 *
 * ```
 * PATCH {"platform":"ANDROID","storeUrl":"javascript:alert(1)"}   → 200 OK
 * GET  /bootstrap  (unauthenticated)  → "store_url": "javascript:alert(1)"
 * ```
 *
 * Every one of the three is handed to a mobile client that opens it, and
 * served from a public endpoint behind our own certificate. A panel that
 * renders one as a plain link is one click from running it.
 *
 * Built on `new URL()` rather than a regex, so there is no gap between what
 * this function judges and what the browser would actually navigate to. A
 * scheme split across a newline, an uppercase `JAVASCRIPT:`, a
 * protocol-relative `//evil.com` — all are the browser's problem to parse, and
 * all are refused here because the parse is the browser's own.
 *
 * The same reasoning, and the same shape, as
 * `features/feedback/attachments.ts`. It is duplicated rather than shared
 * because that one is specific to attachment records and this one carries the
 * bootstrap contract's constant; merging them would couple two unrelated
 * modules through a file neither owns.
 */
export function safeBootstrapHref(value: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    /*
     * Unparseable, or relative. A relative value would resolve against the
     * panel's own origin — which is how `/admin/settings` became a plausible
     * "attachment" in the feedback module.
     */
    return null
  }

  if (parsed.protocol !== BOOTSTRAP_URL_PROTOCOL) return null
  return parsed.href
}

/** Whether a stored value is safe to link. Never whether it is *correct*. */
export function isSafeBootstrapUrl(value: string): boolean {
  return safeBootstrapHref(value) !== null
}
