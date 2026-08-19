/**
 * Presentation-level masking.
 *
 * plan.md §3.9: sensitive fields render masked by default. Masking in the UI
 * is NOT a substitute for backend field-level authorization — if the backend
 * should not disclose a value, it must not send it. These helpers exist so a
 * value the operator is permitted to see is still not casually exposed on a
 * shared screen or in a screenshot.
 */

const DOT = '•'

function repeat(count: number): string {
  return DOT.repeat(Math.max(0, count))
}

/**
 * Mask a phone number, keeping the country prefix and last four digits.
 *
 * @example maskPhone('+8801712345678') // "+880••••••5678"
 */
export function maskPhone(phone: string): string {
  const trimmed = phone.trim()
  if (trimmed.length === 0) return ''

  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')

  if (digits.length <= 4) return repeat(digits.length)

  const prefixLength = hasPlus ? Math.min(3, digits.length - 4) : 0
  const prefix = digits.slice(0, prefixLength)
  const last4 = digits.slice(-4)
  const hiddenCount = digits.length - prefixLength - 4

  return `${hasPlus ? '+' : ''}${prefix}${repeat(hiddenCount)}${last4}`
}

/**
 * Mask an email, keeping the first two local characters and the full domain.
 *
 * @example maskEmail('jonathan.doe@example.com') // "jo••••••••••@example.com"
 */
export function maskEmail(email: string): string {
  const trimmed = email.trim()
  const atIndex = trimmed.lastIndexOf('@')
  if (atIndex <= 0) return repeat(trimmed.length)

  const local = trimmed.slice(0, atIndex)
  const domain = trimmed.slice(atIndex)

  if (local.length <= 2) return `${repeat(local.length)}${domain}`
  return `${local.slice(0, 2)}${repeat(local.length - 2)}${domain}`
}

/**
 * Mask a payout or provider reference, keeping only the final four characters.
 * Any provider-specific prefix is preserved so an operator can tell a bank
 * account from a wallet ID without seeing the identifier.
 *
 * @example maskReference('acct_1M2n3B4v5C6x7Z') // "acct_••••6x7Z"
 */
export function maskReference(reference: string): string {
  const trimmed = reference.trim()
  if (trimmed.length === 0) return ''
  if (trimmed.length <= 4) return repeat(trimmed.length)

  const separatorIndex = trimmed.indexOf('_')
  const prefix =
    separatorIndex > 0 && separatorIndex < 8 ? trimmed.slice(0, separatorIndex + 1) : ''
  const body = trimmed.slice(prefix.length)

  if (body.length <= 4) return `${prefix}${repeat(body.length)}`
  return `${prefix}${repeat(Math.min(4, body.length - 4))}${body.slice(-4)}`
}

/**
 * Shorten a long opaque identifier for display without losing the ends that
 * make it recognisable. Full value stays available via CopyableId's tooltip.
 *
 * @example truncateMiddle('corr_01JQZ8N4X7VYB2K9TREM5HWDCF', 16) // "corr_01J…5HWDCF"
 */
export function truncateMiddle(value: string, maxLength = 18): string {
  if (value.length <= maxLength) return value

  const keep = maxLength - 1
  const head = Math.ceil(keep / 2)
  const tail = Math.floor(keep / 2)

  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`
}

export type MaskKind = 'phone' | 'email' | 'reference'

export function maskValue(kind: MaskKind, value: string): string {
  switch (kind) {
    case 'phone':
      return maskPhone(value)
    case 'email':
      return maskEmail(value)
    case 'reference':
      return maskReference(value)
  }
}
