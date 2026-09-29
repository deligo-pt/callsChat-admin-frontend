/**
 * Sample figures for the dashboard preview.
 *
 * ⚠️ **None of this is real.** `GET /admin/dashboard/snapshot`, `/trends` and
 * `/admin/analytics` are not consumed yet, so the screen shows a shaped
 * placeholder rather than an empty box — and says so on the page, in a notice
 * that cannot be dismissed.
 *
 * Kept in one file on purpose: when the API lands, the page swaps these
 * constants for a query and nothing else about it changes.
 *
 * Two rules the numbers follow:
 *
 * - **Plausible, not round.** `12,480` reads as a measurement; `10,000` reads
 *   as a placeholder nobody replaced, which is how a demo figure ends up in a
 *   board deck.
 * - **No invented people.** The activity list carries roles and actions, never
 *   names or avatars — a fake "Sarah Connor" on a demo screen gets mistaken
 *   for a real account, and someone goes looking for it.
 */

export interface DemoStat {
  readonly id: string
  readonly label: string
  readonly value: string
  /** Change against the previous period, already formatted. */
  readonly delta: string
  readonly direction: 'up' | 'down' | 'flat'
  /** What the number means, for anyone who has not seen it before. */
  readonly hint: string
}

export const DEMO_STATS: readonly DemoStat[] = [
  {
    id: 'users',
    label: 'Registered users',
    value: '12,480',
    delta: '+3.2%',
    direction: 'up',
    hint: 'Accounts that have completed sign-up.',
  },
  {
    id: 'active',
    label: 'Active today',
    value: '2,137',
    delta: '+1.8%',
    direction: 'up',
    hint: 'Opened the app in the last 24 hours.',
  },
  {
    id: 'calls',
    label: 'Calls this week',
    value: '8,642',
    delta: '−0.4%',
    direction: 'down',
    hint: 'Connected calls, excluding missed.',
  },
  {
    id: 'tickets',
    label: 'Open feedback',
    value: '37',
    delta: '+6',
    direction: 'up',
    hint: 'Tickets not yet resolved or closed.',
  },
]

export interface DemoTrendPoint {
  readonly label: string
  readonly value: number
}

/** Seven days of sign-ups. The shape matters; the values do not. */
export const DEMO_SIGNUPS: readonly DemoTrendPoint[] = [
  { label: 'Mon', value: 112 },
  { label: 'Tue', value: 148 },
  { label: 'Wed', value: 131 },
  { label: 'Thu', value: 176 },
  { label: 'Fri', value: 204 },
  { label: 'Sat', value: 158 },
  { label: 'Sun', value: 97 },
]

export interface DemoActivity {
  readonly id: string
  readonly action: string
  /** Who did it, by role — never a name. */
  readonly actor: string
  readonly when: string
  readonly tone: 'neutral' | 'warning' | 'danger'
}

export const DEMO_ACTIVITY: readonly DemoActivity[] = [
  {
    id: 'a1',
    action: 'Suspended an account for spam reports',
    actor: 'Moderator',
    when: '12 minutes ago',
    tone: 'warning',
  },
  {
    id: 'a2',
    action: 'Replied to a support ticket',
    actor: 'Super Admin',
    when: '41 minutes ago',
    tone: 'neutral',
  },
  {
    id: 'a3',
    action: 'Raised the minimum supported app version',
    actor: 'Super Admin',
    when: '2 hours ago',
    tone: 'neutral',
  },
  {
    id: 'a4',
    action: 'Banned an account after repeated reports',
    actor: 'Admin',
    when: '5 hours ago',
    tone: 'danger',
  },
  {
    id: 'a5',
    action: 'Granted a staff member settings access',
    actor: 'Super Admin',
    when: 'Yesterday',
    tone: 'neutral',
  },
]
