import { z } from 'zod'

import { passwordSchema } from '@/lib/passwordPolicy'
import {
  modulePermissionSchema,
  staffRoleSchema,
  type CreateStaffPayload,
} from '@/types/staff'

/**
 * The provisioning form (staff_management_plan.md §2.3).
 *
 * Mirrors the server's rules where it has them and **adds two it is missing**,
 * both stated here so nobody later mistakes them for the API's:
 *
 * 1. **Password.** The server checks length ≥ 8 and nothing else — `"password"`
 *    passes (§3.5). The panel applies `lib/passwordPolicy`, exactly as it does
 *    for the operator's own password. The person choosing a colleague's first
 *    credential is the only one positioned to choose a good one.
 * 2. **Email format.** The server's own message is `Valid email address is
 *    required`; matching it client-side saves a round trip, and the server
 *    still has the last word.
 *
 * `phone` is deliberately **not** validated. The API accepts `"nonsense"`
 * (§8 O4), so a client-side format rule would reject numbers the backend
 * stores happily and, worse, imply a validation that does not exist. Blank is
 * the meaningful case and it is handled by omission, not by a rule.
 */
export const createStaffSchema = z.object({
  email: z.email('Enter a valid email address.'),
  displayName: z
    .string()
    .trim()
    .min(1, 'Enter a display name.')
    .max(120, 'Use 120 characters or fewer.'),
  phone: z.string().trim(),
  role: staffRoleSchema,
  password: passwordSchema,
  /*
   * Never `.min(1)`. An account with no module access is a valid, deliberate
   * outcome — denied by default, plan.md §8 — not an incomplete form. Making
   * the grid mandatory would push an operator into granting *something* just
   * to get past validation, which is the opposite of what it is for.
   */
  permissions: z.array(modulePermissionSchema),
})

export type CreateStaffValues = z.infer<typeof createStaffSchema>

/** Every field name the server can name in a validation message. */
export const CREATE_STAFF_FIELDS = [
  'email',
  'password',
  'displayName',
  'role',
  'phone',
  'permissions',
] as const

export const CREATE_STAFF_DEFAULTS: CreateStaffValues = {
  email: '',
  displayName: '',
  phone: '',
  /*
   * The lower of the two, matching the empty grid beside it. A form that opens
   * pre-selected on ADMIN would make the more privileged choice the one an
   * operator has to actively avoid.
   */
  role: 'MODERATOR',
  password: '',
  permissions: [],
}

/**
 * Form values → request body.
 *
 * A blank phone is **omitted**, never sent as `""`: the API does not validate
 * the field, so an empty string would be stored as somebody's phone number
 * rather than recording that they have none.
 *
 * `permissions` is always sent, including when empty — see the schema.
 */
export function buildCreatePayload(values: CreateStaffValues): CreateStaffPayload {
  const phone = values.phone.trim()

  return {
    email: values.email.trim(),
    password: values.password,
    displayName: values.displayName.trim(),
    role: values.role,
    permissions: values.permissions,
    ...(phone === '' ? {} : { phone }),
  }
}
