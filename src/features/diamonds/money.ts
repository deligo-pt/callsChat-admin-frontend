import { formatCount, formatDiamonds, formatWholeCurrency } from '@/lib/format'

/**
 * Money and diamonds, as this module's payloads actually carry them.
 * `formatWholeCurrency` moved to `lib/format.ts` (the wallet ledger needs it
 * too, and a feature may not import a sibling); re-exported for this module.
 */
export { formatWholeCurrency }

/**
 * Diamonds, defensively.
 *
 * ⚠️ **`formatDiamonds` throws on a non-integer**, and a throw inside a table
 * cell takes the whole queue down, not one number. Diamonds are whole units by
 * definition and the backend should only ever send integers — but no row has
 * ever been observed on this endpoint (plan.md O11), the field is typed
 * `z.number()` precisely because of that, and "the contract says it cannot
 * happen" is what the host module believed about `suspensionReason`.
 *
 * So a fractional value is formatted rather than thrown on. If one ever
 * appears, an operator sees an odd number and can report it; the alternative
 * is a blank screen with a stack trace in the console.
 */
export function formatDiamondAmount(
  amount: number | null | undefined,
  locale?: string,
): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '—'
  return Number.isInteger(amount)
    ? formatDiamonds(amount, locale)
    : formatCount(amount, locale)
}

/** A signed diamond delta, for adjustments — `+500`, `−250`. */
export function formatDiamondDelta(
  amount: number | null | undefined,
  locale?: string,
): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '—'
  /* U+2212 MINUS SIGN, not a hyphen: it aligns with digits and reads as maths. */
  const sign = amount < 0 ? '−' : '+'
  return `${sign}${formatDiamondAmount(Math.abs(amount), locale)}`
}
