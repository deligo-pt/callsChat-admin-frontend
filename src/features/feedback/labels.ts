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
 * Split a `userDeviceInfo` string into displayable lines.
 *
 * The field is **free text** the mobile client formats as it likes, and it has
 * already changed format once. Both shapes are live in production:
 *
 * - **Current (2026-09-21 onward)** — one `Key: value` per line:
 *   ```
 *   App: CallsChat v1.1.19 (Build 12) [com.codextechit.callchat]
 *   OS: Android 13 (SDK 33, Patch: 2024-10-01)
 *   Architecture: arm64-v8a, armeabi-v7a, armeabi
 *   ```
 * - **Legacy** — one line, comma-separated:
 *   `device: Xiaomi 2201117TG, os: Android 13, appVersion: 2.3.0`
 *
 * ⚠️ **Newlines win, and commas are only a fallback for a single line.** The
 * current format puts commas *inside* values — `(SDK 33, Patch: …)` and the
 * architecture list — so the old comma split cut it into five broken pieces
 * such as `"OS: Android 13 (SDK 33"` and a bare `"armeabi-v7a"`. A string that
 * has any line break is split on line breaks and nothing else.
 *
 * It is deliberately **not** parsed into typed fields. There is no contract
 * here — it is one nullable string column — and the app has now shown it will
 * change the shape between releases. Presenting `os` and `appVersion` as if
 * they were columns would break silently the next time it does.
 */
export function splitDeviceInfo(deviceInfo: string): readonly string[] {
  const trimmed = deviceInfo.trim()
  if (trimmed.length === 0) return []

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length > 1) return lines

  /* A single line: the legacy comma-separated format, or a plain string. */
  const segments = trimmed
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)

  return segments.length > 1 ? segments : [trimmed]
}

/**
 * One device line as a label and a value, for display only.
 *
 * Split at the **first** `": "` and nowhere else, because values contain
 * colons of their own — `OS: Android 13 (SDK 33, Patch: 2024-10-01)` must keep
 * `Patch: 2024-10-01` inside its value. A line without a separator returns
 * `null` and is rendered whole; this is a reading aid, not a parse, and it
 * never discards text it does not recognise.
 */
export function splitDeviceLine(
  line: string,
): { readonly label: string; readonly value: string } | null {
  const index = line.indexOf(': ')
  if (index <= 0) return null

  const label = line.slice(0, index).trim()
  const value = line.slice(index + 2).trim()
  return label && value ? { label, value } : null
}

/** Every type value, for filter construction. Re-exported so callers need one import. */
export const FEEDBACK_TYPE_OPTIONS = FEEDBACK_TYPE_VALUES
