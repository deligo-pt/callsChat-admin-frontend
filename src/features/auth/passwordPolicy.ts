import { z } from 'zod'

/**
 * The backend's password policy, mirrored for client-side feedback.
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
 * This is a UX affordance, not enforcement: the server re-validates, and it
 * remains the only authority. If the two ever disagree the server wins and its
 * message is what the operator sees.
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

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Re-enter the new password.'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The passwords do not match.',
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password you have not used here before.',
  })

export type ChangePasswordValues = z.infer<typeof changePasswordSchema>

export const changeEmailSchema = z.object({
  newEmail: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your current password to confirm.'),
})

export type ChangeEmailValues = z.infer<typeof changeEmailSchema>
