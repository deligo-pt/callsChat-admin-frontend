import { Bug, Flag, Lightbulb, MessageSquare } from 'lucide-react'
import type { ComponentType } from 'react'

import { FEEDBACK_TYPE_VALUES, type FeedbackType } from '@/types/feedback'

/**
 * Ticket type as a label and an icon (feedback_management_plan.md §5.2).
 *
 * **Type gets no tone**, unlike status and priority, which live in
 * `lib/status.ts` as badge domains. `BUG` / `IMPROVEMENT` / `REPORT` / `OTHER`
 * are categories, not states: colouring them would tell an operator that a bug
 * is worse than a report, which is a priority question the ticket already
 * answers with a field of its own.
 *
 * A separate module from any component, because a file exporting both a
 * component and a plain data object breaks Fast Refresh — the same rule that
 * split `cells.tsx` out of `staffColumns.tsx`.
 */

export interface FeedbackTypeDescriptor {
  readonly value: FeedbackType
  readonly label: string
  readonly icon: ComponentType<{ className?: string }>
  /**
   * What the user was told this option meant when they picked it.
   *
   * Rendered in the queue's type filter rather than in a tooltip: `REPORT`
   * means "report another user", not "report a problem", and an operator
   * filtering a support queue will otherwise read it as the latter.
   */
  readonly description: string
}

export const FEEDBACK_TYPES: readonly FeedbackTypeDescriptor[] = [
  {
    value: 'BUG',
    label: 'Bug',
    icon: Bug,
    description: 'Something in the app is broken or behaves incorrectly.',
  },
  {
    value: 'IMPROVEMENT',
    label: 'Improvement',
    icon: Lightbulb,
    description: 'A suggestion or feature request.',
  },
  {
    value: 'REPORT',
    label: 'Report',
    icon: Flag,
    description: 'A report about another user, a club, or content.',
  },
  {
    value: 'OTHER',
    label: 'Other',
    icon: MessageSquare,
    description: 'Anything that does not fit the categories above.',
  },
]

export function describeFeedbackType(type: FeedbackType): FeedbackTypeDescriptor {
  const found = FEEDBACK_TYPES.find((entry) => entry.value === type)
  /*
   * Unreachable while `feedbackTypeSchema` stays strict — an unknown type
   * fails contract validation long before it reaches a renderer. Throwing
   * rather than returning a placeholder keeps it that way.
   */
  if (!found) throw new Error(`Unknown feedback type: ${type}`)
  return found
}

/**
 * Split a `userDeviceInfo` string into displayable segments.
 *
 * The field is **free text**, formatted by the mobile client as
 * `"device: Xiaomi 2201117TG, os: Android 13, appVersion: 2.3.0"`. The panel
 * splits it for readability and falls back to the whole string when that
 * yields a single segment.
 *
 * It is deliberately **not** parsed into typed fields. There is no contract
 * here — it is one nullable string column, and the app is free to change its
 * shape in the next release. Presenting `os` and `appVersion` as if they were
 * columns would break silently the first time it does.
 */
export function splitDeviceInfo(deviceInfo: string): readonly string[] {
  const segments = deviceInfo
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)

  return segments.length > 1 ? segments : [deviceInfo.trim()]
}

/** Every type value, for filter construction. Re-exported so callers need one import. */
export const FEEDBACK_TYPE_OPTIONS = FEEDBACK_TYPE_VALUES
