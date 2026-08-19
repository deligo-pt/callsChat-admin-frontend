/**
 * The single source of truth for every status label and colour in the app.
 *
 * plan.md §3.7 / §9: backend enums drive labels. No page invents its own
 * label, colour or state name, and no component ever receives a raw colour.
 *
 * An unrecognised enum value degrades gracefully to a neutral badge with a
 * humanised label — a backend adding a state must never crash the UI.
 */

export type StatusTone =
  'success' | 'warning' | 'danger' | 'info' | 'locked' | 'neutral' | 'primary'

export interface StatusDescriptor {
  readonly label: string
  readonly tone: StatusTone
}

export type StatusDomain =
  | 'user'
  | 'restriction'
  | 'hostApplication'
  | 'socialClub'
  | 'moderationCase'
  | 'withdrawal'
  | 'payment'
  | 'balance'
  | 'notification'

type DomainMap = Readonly<Record<string, StatusDescriptor>>

const USER: DomainMap = {
  ACTIVE: { label: 'Active', tone: 'success' },
  SUSPENDED: { label: 'Suspended', tone: 'warning' },
  BANNED: { label: 'Banned', tone: 'danger' },
}

const RESTRICTION: DomainMap = {
  MESSAGING: { label: 'Messaging blocked', tone: 'locked' },
  VOICE_CALL: { label: 'Voice calls blocked', tone: 'locked' },
  VIDEO_CALL: { label: 'Video calls blocked', tone: 'locked' },
  CLUB_PARTICIPATION: { label: 'Club participation blocked', tone: 'locked' },
  CLUB_CREATION: { label: 'Club creation blocked', tone: 'locked' },
  GIFTING: { label: 'Gifting blocked', tone: 'locked' },
  DIAMOND_PURCHASE: { label: 'Diamond purchase blocked', tone: 'locked' },
  HOSTING: { label: 'Hosting blocked', tone: 'locked' },
}

const HOST_APPLICATION: DomainMap = {
  SUBMITTED: { label: 'Submitted', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
}

const SOCIAL_CLUB: DomainMap = {
  SCHEDULED: { label: 'Scheduled', tone: 'neutral' },
  ACTIVE: { label: 'Active', tone: 'success' },
  ENDED: { label: 'Ended', tone: 'neutral' },
  DISABLED: { label: 'Disabled', tone: 'danger' },
}

const MODERATION_CASE: DomainMap = {
  OPEN: { label: 'Open', tone: 'warning' },
  UNDER_REVIEW: { label: 'Under review', tone: 'info' },
  RESOLVED: { label: 'Resolved', tone: 'success' },
}

const WITHDRAWAL: DomainMap = {
  PENDING: { label: 'Pending', tone: 'warning' },
  UNDER_REVIEW: { label: 'Under review', tone: 'info' },
  APPROVED: { label: 'Approved', tone: 'primary' },
  PROCESSING: { label: 'Processing', tone: 'primary' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  FAILED: { label: 'Failed', tone: 'danger' },
}

const PAYMENT: DomainMap = {
  PENDING: { label: 'Pending', tone: 'warning' },
  SUCCEEDED: { label: 'Succeeded', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  REFUNDED: { label: 'Refunded', tone: 'neutral' },
  CHARGEBACK: { label: 'Chargeback', tone: 'danger' },
}

/** plan.md §9: available and locked are never combined into one figure. */
const BALANCE: DomainMap = {
  AVAILABLE: { label: 'Available', tone: 'success' },
  LOCKED: { label: 'Locked', tone: 'locked' },
}

const NOTIFICATION: DomainMap = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SCHEDULED: { label: 'Scheduled', tone: 'info' },
  QUEUED: { label: 'Queued', tone: 'warning' },
  SENT_TO_PROVIDER: { label: 'Sent to provider', tone: 'info' },
  DELIVERED: { label: 'Delivered', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
}

const DOMAINS: Readonly<Record<StatusDomain, DomainMap>> = {
  user: USER,
  restriction: RESTRICTION,
  hostApplication: HOST_APPLICATION,
  socialClub: SOCIAL_CLUB,
  moderationCase: MODERATION_CASE,
  withdrawal: WITHDRAWAL,
  payment: PAYMENT,
  balance: BALANCE,
  notification: NOTIFICATION,
}

/**
 * Turn an unknown backend enum into something readable rather than showing a
 * raw SCREAMING_SNAKE value to an operator.
 */
export function humaniseEnum(value: string): string {
  const cleaned = value.trim().replace(/[_-]+/g, ' ').toLowerCase()
  if (cleaned.length === 0) return 'Unknown'
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

export function resolveStatus(domain: StatusDomain, value: string): StatusDescriptor {
  const known = DOMAINS[domain][value]
  if (known) return known
  return { label: humaniseEnum(value), tone: 'neutral' }
}

/** Every value a domain currently knows about — used by the design gallery. */
export function knownStatuses(domain: StatusDomain): readonly string[] {
  return Object.keys(DOMAINS[domain])
}

/**
 * Tailwind classes per tone. Soft background + accessible foreground, always
 * from semantic tokens — never a raw ramp step.
 */
export const TONE_CLASSES: Readonly<Record<StatusTone, string>> = {
  success: 'bg-success-soft text-success-foreground',
  warning: 'bg-warning-soft text-warning-foreground',
  danger: 'bg-danger-soft text-danger-foreground',
  info: 'bg-info-soft text-info-foreground',
  locked: 'bg-locked-soft text-locked-foreground',
  neutral: 'bg-neutral-soft text-neutral-foreground',
  primary: 'bg-primary-soft text-primary-700',
}

/** Solid dot colour used by compact list rows. */
export const TONE_DOT_CLASSES: Readonly<Record<StatusTone, string>> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  locked: 'bg-locked',
  neutral: 'bg-neutral',
  primary: 'bg-primary',
}
