import { z } from 'zod'

import { passwordSchema } from '@/lib/passwordPolicy'

/**
 * Form schemas for the operator's OWN credentials.
 *
 * The rule itself moved to `lib/passwordPolicy.ts` in A2, so that staff
 * provisioning could enforce the same one without importing a sibling feature.
 * What stays here is what is genuinely about *this* screen: confirming the new
 * password, and refusing to reuse the current one.
 */

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
