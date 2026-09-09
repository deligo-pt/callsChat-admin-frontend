/**
 * The single source of truth for every status label and colour in the app.
 *
 * plan.md §3.7 / §9: backend enums drive labels. No page invents its own
 * label, colour or state name, and no component ever receives a raw colour.
 *
 * The `user` and `restriction` families were corrected against the live API on
 * 2026-08-25 (plan.md §10.4) — `INACTIVE`/`PENDING_VERIFICATION` are real
 * account states, the club capabilities are prefixed `SOCIAL_CLUB_`, and
 * `HOSTING` does not exist. Remaining families are still unverified.
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
  | 'accountType'
  | 'notification'
  | 'backup'
  | 'smsProvider'
  | 'smsTest'
  | 'maintenance'
  | 'staff'
  | 'staffRole'
  | 'feedback'
  | 'feedbackPriority'

type DomainMap = Readonly<Record<string, StatusDescriptor>>

const USER: DomainMap = {
  ACTIVE: { label: 'Active', tone: 'success' },
  INACTIVE: { label: 'Inactive', tone: 'neutral' },
  PENDING_VERIFICATION: { label: 'Pending verification', tone: 'info' },
  SUSPENDED: { label: 'Suspended', tone: 'warning' },
  BANNED: { label: 'Banned', tone: 'danger' },
  /*
   * A deletion grace period. `locked` rather than `danger` or `warning`: it is
   * not a moderation penalty, and reading as one would misrepresent why the
   * account is frozen.
   */
  SCHEDULED_FOR_DELETION: { label: 'Scheduled for deletion', tone: 'locked' },
}

const RESTRICTION: DomainMap = {
  MESSAGING: { label: 'Messaging blocked', tone: 'locked' },
  VOICE_CALL: { label: 'Voice calls blocked', tone: 'locked' },
  VIDEO_CALL: { label: 'Video calls blocked', tone: 'locked' },
  SOCIAL_CLUB_PARTICIPATION: { label: 'Club participation blocked', tone: 'locked' },
  SOCIAL_CLUB_CREATION: { label: 'Club creation blocked', tone: 'locked' },
  GIFTING: { label: 'Gifting blocked', tone: 'locked' },
  DIAMOND_PURCHASE: { label: 'Diamond purchase blocked', tone: 'locked' },
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

const ACCOUNT_TYPE: DomainMap = {
  PERSONAL: { label: 'Personal', tone: 'neutral' },
  BUSINESS: { label: 'Business', tone: 'info' },
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

/**
 * `database_backup_logs.status` (system_settings_plan.md §2.7).
 *
 * `RUNNING` is `info`, not `warning`: a job in flight is the expected state,
 * not something needing attention. It becomes `danger` only once it actually
 * fails — which, on production today, it always does.
 */
const BACKUP: DomainMap = {
  RUNNING: { label: 'Running', tone: 'info' },
  SUCCESS: { label: 'Completed', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
}

const SMS_PROVIDER: DomainMap = {
  BULKGATE: { label: 'BulkGate', tone: 'info' },
  TWILIO: { label: 'Twilio', tone: 'info' },
  /*
   * `danger`, not `neutral`. With no SMS provider no user can receive an OTP,
   * so sign-in and sign-up are down platform-wide — that is a broken service,
   * not a preference someone switched off.
   */
  DISABLED: { label: 'Disabled', tone: 'danger' },
}

const SMS_TEST: DomainMap = {
  SUCCESS: { label: 'Delivered', tone: 'success' },
  FAILED: { label: 'Not delivered', tone: 'danger' },
}

/**
 * Derived client-side from `maintenanceMode` plus the advisory window — the
 * API has no such enum. `resolveMaintenanceState` below is the only place the
 * derivation happens.
 */
const MAINTENANCE: DomainMap = {
  ACTIVE: { label: 'Live — users blocked', tone: 'danger' },
  SCHEDULED: { label: 'Scheduled', tone: 'warning' },
  OFF: { label: 'Off', tone: 'neutral' },
}

/**
 * A staff account's lifecycle state (staff_management_plan.md §5.2).
 *
 * Deliberately **not** the `USER` map, and the difference is the whole point.
 *
 * `USER` renders `INACTIVE` as a neutral "Inactive", which for a consumer
 * account is right — it is dormant. For a staff account `INACTIVE` is what
 * `DELETE /admin/staff/:id` sets, so it means *deleted*: sessions purged,
 * sign-in blocked, no route back. Because the backend also fails to filter
 * those rows out of the directory, that badge is the only thing separating a
 * deleted colleague from a working one — and calling it "Inactive" would tell
 * the operator the opposite of what happened.
 *
 * `locked` (violet) is already this panel's colour for *this record is closed
 * to action*, which is exactly true here: every mutation against it answers
 * 404.
 *
 * `BANNED` is `danger` rather than `locked` because, unlike the deletion, it
 * is reversible — `PATCH /:id/status` back to `ACTIVE` works.
 */
const STAFF: DomainMap = {
  ACTIVE: { label: 'Active', tone: 'success' },
  SUSPENDED: { label: 'Suspended', tone: 'warning' },
  BANNED: { label: 'Banned', tone: 'danger' },
  INACTIVE: { label: 'Deleted', tone: 'locked' },
}

/**
 * Admin-panel role, as a badge.
 *
 * `primary` for Admin and `neutral` for Moderator: the tone carries the
 * privilege difference at a glance down a column, without either reading as a
 * warning — neither role is a problem state.
 *
 * `SUPER_ADMIN` is included for the top bar and the account page only. It can
 * never appear in the staff directory, which excludes Super Admins entirely.
 */
const STAFF_ROLE: DomainMap = {
  SUPER_ADMIN: { label: 'Super Admin', tone: 'locked' },
  ADMIN: { label: 'Admin', tone: 'primary' },
  MODERATOR: { label: 'Moderator', tone: 'neutral' },
}

/**
 * A support ticket's lifecycle state (feedback_management_plan.md §5.2).
 *
 * `PENDING` is `warning`, not `neutral`, and it is the only state that is: it
 * means nobody has looked at the ticket yet, so it is the one value in this map
 * that represents a debt to a person who is waiting. A neutral badge would let
 * a queue of untouched tickets read as a queue at rest.
 *
 * `CLOSED` is `neutral` rather than `success`. A ticket closed without being
 * resolved is closed too — `PENDING → CLOSED` is a legal transition — so
 * colouring the terminal state green would claim an outcome the state does not
 * carry. `RESOLVED` is the state that claims it, and it is the green one.
 *
 * `REOPENED` is `danger`, the strongest tone in the map, because it is the one
 * value that means *this was declared done and it was not*. It is the most
 * important thing an operator can spot while scanning a queue, and it earns the
 * loudest colour in a domain where nothing else is an emergency.
 */
const FEEDBACK: DomainMap = {
  PENDING: { label: 'Pending', tone: 'warning' },
  REVIEWING: { label: 'Reviewing', tone: 'info' },
  IN_PROGRESS: { label: 'In progress', tone: 'primary' },
  RESOLVED: { label: 'Resolved', tone: 'success' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
  REOPENED: { label: 'Reopened', tone: 'danger' },
}

/**
 * A support ticket's urgency.
 *
 * Set by the reporter and editable by staff, so it is a claim about the ticket
 * rather than a state of it — but it is rendered as a badge beside the status
 * and needs to be legible in the same glance, which is why it is a tone map
 * rather than a plain label.
 *
 * Note this scale runs the other way from `USER`: here `neutral` is the *low*
 * end, because an unremarkable priority is genuinely unremarkable.
 */
const FEEDBACK_PRIORITY: DomainMap = {
  LOW: { label: 'Low', tone: 'neutral' },
  MEDIUM: { label: 'Medium', tone: 'info' },
  HIGH: { label: 'High', tone: 'warning' },
  CRITICAL: { label: 'Critical', tone: 'danger' },
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
  accountType: ACCOUNT_TYPE,
  notification: NOTIFICATION,
  backup: BACKUP,
  smsProvider: SMS_PROVIDER,
  smsTest: SMS_TEST,
  maintenance: MAINTENANCE,
  staff: STAFF,
  staffRole: STAFF_ROLE,
  feedback: FEEDBACK,
  feedbackPriority: FEEDBACK_PRIORITY,
}

/** The three states the maintenance card and the global banner can be in. */
export type MaintenanceState = 'ACTIVE' | 'SCHEDULED' | 'OFF'

/**
 * Derive the maintenance state from the settings record.
 *
 * The switch is the only thing that actually blocks traffic; the window is
 * advisory metadata the backend does not act on. So `ACTIVE` is driven by
 * `maintenanceMode` alone, and `SCHEDULED` means only "a future window is
 * recorded" — never "users are about to be cut off automatically", because
 * nothing automatic happens.
 */
export function resolveMaintenanceState(
  maintenanceMode: boolean,
  maintenanceStartsAt: string | null,
  now: Date = new Date(),
): MaintenanceState {
  if (maintenanceMode) return 'ACTIVE'
  if (!maintenanceStartsAt) return 'OFF'

  const startsAt = new Date(maintenanceStartsAt)
  if (Number.isNaN(startsAt.getTime())) return 'OFF'

  return startsAt.getTime() > now.getTime() ? 'SCHEDULED' : 'OFF'
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
