import { z } from 'zod'

/**
 * The password rule the panel enforces, wherever a password is chosen.
 *
 * Taken verbatim from the API's own rejection messages on
 * `PATCH /admin/auth/password` (verified 2026-08-25):
 *
 *   - at least 8 characters
 *   - at least one uppercase letter, one lowercase letter, and one number
 *
 * Note there is NO symbol requirement, despite the seeded example passwords
 * containing one — guessing at a stricter rule would reject passwords the
 * server accepts.
 *
 * ⚠️ **Not every endpoint enforces this.** `POST /admin/staff` and
 * `PATCH /admin/staff/:id/reset-password` check length and nothing else, so
 * `"password"` passes server-side (staff_management_plan.md §3.5). The panel
 * keeps the stricter rule anyway: the operator choosing a colleague's first
 * password is the only person in a position to choose a good one.
 *
 * Where the two disagree the server still wins, and its message is what the
 * operator sees — this is a client-side affordance, never enforcement.
 *
 * Promoted from `features/auth` in A2, when staff provisioning needed the same
 * rule and a feature may not import a sibling feature (plan.md §7).
 */

export const MIN_PASSWORD_LENGTH = 8

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  .regex(/[A-Z]/, 'Include an uppercase letter.')
  .regex(/[a-z]/, 'Include a lowercase letter.')
  .regex(/[0-9]/, 'Include a number.')

export interface PolicyRule {
  readonly label: string
  readonly met: (value: string) => boolean
}

/** Rendered as a live checklist so the rules are visible before submitting. */
export const PASSWORD_RULES: readonly PolicyRule[] = [
  {
    label: `At least ${MIN_PASSWORD_LENGTH} characters`,
    met: (value) => value.length >= MIN_PASSWORD_LENGTH,
  },
  { label: 'An uppercase letter', met: (value) => /[A-Z]/.test(value) },
  { label: 'A lowercase letter', met: (value) => /[a-z]/.test(value) },
  { label: 'A number', met: (value) => /[0-9]/.test(value) },
]
