/**
 * Idempotency keys for financial mutations (plan.md §10).
 *
 * Every request that can move money or Diamonds carries one, so a retry —
 * whether from a flaky network, a double click, or a React re-render — returns
 * the original outcome instead of creating a second ledger movement.
 */

/** RFC 4122 v4 UUID, using the platform generator where available. */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  // Fallback for environments without crypto.randomUUID (older jsdom).
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }

  // Set version (4) and variant (10xx) bits.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Correlation ID for request tracing. Distinct from the idempotency key. */
export function newCorrelationId(): string {
  return `corr_${newIdempotencyKey().replace(/-/g, '')}`
}

/**
 * Endpoints whose mutations move money or Diamonds and therefore REQUIRE an
 * idempotency key. `apiClient` throws rather than send one of these without.
 */
const FINANCIAL_PATH_PATTERNS: readonly RegExp[] = [
  /^\/admin\/adjustments/,
  /^\/admin\/withdrawals\/[^/]+\/(approve|reject|processing|complete|fail)/,
  /^\/admin\/payments\/[^/]+\/refund/,
  /^\/admin\/diamond-packages/,
  /^\/admin\/payout-rates/,
]

export function isFinancialMutation(method: string, path: string): boolean {
  const upper = method.toUpperCase()
  if (upper === 'GET' || upper === 'HEAD') return false
  return FINANCIAL_PATH_PATTERNS.some((pattern) => pattern.test(path))
}
