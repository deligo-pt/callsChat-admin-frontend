/**
 * Integer-safe display formatters.
 *
 * plan.md §3.3: money and Diamond quantities are integers in the smallest
 * defined unit. These functions FORMAT values for display — they never do
 * arithmetic on them, and they never route a value through floating point.
 *
 * Currency conversion from minor units is done with string manipulation
 * rather than division, so a value like 1_000_000_001 minor units cannot lose
 * precision on its way to the screen.
 */

/** ISO 4217 currencies whose minor unit is not 2 decimal places. */
const MINOR_UNIT_EXPONENTS: Readonly<Record<string, number>> = {
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  UYI: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
}

const DEFAULT_MINOR_UNIT_EXPONENT = 2

export function minorUnitExponent(currency: string): number {
  return MINOR_UNIT_EXPONENTS[currency.toUpperCase()] ?? DEFAULT_MINOR_UNIT_EXPONENT
}

/**
 * Convert an integer amount in minor units to an exact decimal string.
 * Pure string arithmetic — no division, no float.
 */
export function minorUnitsToDecimalString(
  minorUnits: number,
  exponent: number,
): string {
  if (!Number.isInteger(minorUnits)) {
    throw new TypeError(
      `Money amounts must be integers in minor units, received: ${String(minorUnits)}`,
    )
  }
  if (exponent === 0) return String(minorUnits)

  const negative = minorUnits < 0
  const digits = Math.abs(minorUnits)
    .toString()
    .padStart(exponent + 1, '0')
  const whole = digits.slice(0, digits.length - exponent)
  const fraction = digits.slice(digits.length - exponent)

  return `${negative ? '-' : ''}${whole}.${fraction}`
}

export interface MoneyFormatOptions {
  /** BCP-47 locale. Defaults to the operator's browser locale. */
  readonly locale?: string
  /** Render the ISO code instead of the currency symbol (clearer in finance tables). */
  readonly display?: 'symbol' | 'code' | 'narrowSymbol'
}

/**
 * Format an integer minor-unit amount as localised currency.
 *
 * @example formatMoney(3600, 'USD') // "$36.00"
 * @example formatMoney(400000, 'JPY') // "¥400,000"  (JPY has no minor unit)
 */
export function formatMoney(
  minorUnits: number,
  currency: string,
  options: MoneyFormatOptions = {},
): string {
  const code = currency.toUpperCase()
  const exponent = minorUnitExponent(code)
  const decimal = minorUnitsToDecimalString(minorUnits, exponent)

  return new Intl.NumberFormat(options.locale, {
    style: 'currency',
    currency: code,
    currencyDisplay: options.display ?? 'symbol',
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
    // Intl.NumberFormat V3 accepts a decimal string, preserving exactness.
  }).format(decimal as unknown as number)
}

/**
 * Format a Diamond quantity. Diamonds are whole units — there is no minor unit
 * and no fractional Diamond.
 *
 * @example formatDiamonds(1284500) // "1,284,500"
 */
export function formatDiamonds(amount: number, locale?: string): string {
  if (!Number.isInteger(amount)) {
    throw new TypeError(`Diamond amounts must be integers, received: ${String(amount)}`)
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amount)
}

/** Plain integer counts (participants, reports, rows). */
export function formatCount(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)
}

/**
 * Percentages arrive from the backend already calculated. This only formats;
 * it never derives a rate from two numbers.
 */
export function formatPercent(
  value: number,
  { locale, fractionDigits = 1 }: { locale?: string; fractionDigits?: number } = {},
): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

/** Compact display for dashboard cards, e.g. 12_400 -> "12.4K". */
export function formatCompact(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

/** Human-readable byte size for export files. */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'] as const
  let index = 0
  let size = bytes
  while (size >= 1024 && index < units.length - 1) {
    size = size / 1024
    index += 1
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index] ?? 'B'}`
}

/** Duration in seconds -> "1h 24m" / "3m 12s". Used for club session length. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60

  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}
