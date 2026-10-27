import { formatCount, formatDiamonds } from '@/lib/format'

/**
 * Money and diamonds, as this module's payloads actually carry them.
 *
 * ⚠️ **`lib/format.ts#formatMoney` does not fit here, and using it would be
 * wrong by a factor of a hundred.** It takes *minor units* — `formatMoney(3600,
 * 'USD')` is `$36.00` — because every other financial surface in this panel
 * receives paisa and cents. The wallet payloads do not: `amountBdt: 1200` is
 * twelve hundred taka and `priceUsd: 25.5` is twenty-five and a half dollars,
 * both verified against the guide's examples and the live package rows. Passing
 * either through `formatMoney` renders `৳12.00`, which is a believable number
 * and therefore the dangerous kind of wrong.
 *
 * ⚠️ **`priceUsd` is a float**, so nothing here may coerce to an integer.
 */
export function formatWholeCurrency(
  amount: number | null | undefined,
  currency: string,
  locale?: string,
): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '—'

  /*
   * ⚠️ No forced locale, matching every other formatter in `lib/format.ts`.
   * One consequence worth knowing: under an English locale `Intl` renders BDT
   * as `BDT 3,000` rather than `৳3,000`. That is the better outcome for an
   * operations tool — `৳` is also used for the Indian rupee in some fonts and
   * contexts, and an unambiguous ISO code beats a glyph when the number is a
   * payment somebody is about to approve.
   */
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    currencyDisplay: 'symbol',
    /*
     * Whole-unit amounts are usually round, and `৳1,200` reads better than
     * `৳1,200.00` in a dense table — but a price of `25.5` must not become
     * `$26`, so the fraction is allowed when it is there.
     */
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

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
