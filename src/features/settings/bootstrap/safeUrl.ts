import { ALLOWED_URL_PROTOCOL, safeHttpsUrl } from '@/lib/safeUrl'
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
 * The same reasoning as `features/feedback/attachments.ts`. This once argued
 * the duplication was right — "merging them would couple two unrelated modules
 * through a file neither owns" — and that held at two copies. It stopped
 * holding at three, so the parse moved to `lib/safeUrl.ts` on 2026-10-15 and
 * this function now delegates. What stays here is the bootstrap contract's own
 * constant and its own evidence.
 */
export function safeBootstrapHref(value: string): string | null {
  /*
   * ⚠️ Delegates to `lib/safeUrl` since 2026-10-15 — see the note there for
   * why the duplication argument below stopped holding at the third copy.
   *
   * `BOOTSTRAP_URL_PROTOCOL` is asserted against the shared constant rather
   * than used to re-implement the check, so this module still fails loudly if
   * its contract ever diverges from what `lib/safeUrl` permits.
   */
  if (BOOTSTRAP_URL_PROTOCOL !== ALLOWED_URL_PROTOCOL) return null

  return safeHttpsUrl(value)
}

/** Whether a stored value is safe to link. Never whether it is *correct*. */
export function isSafeBootstrapUrl(value: string): boolean {
  return safeBootstrapHref(value) !== null
}
