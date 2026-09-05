import { describe, expect, it } from 'vitest'

import {
  buildCreatePayload,
  CREATE_STAFF_DEFAULTS,
  createStaffSchema,
  type CreateStaffValues,
} from './schemas'

/**
 * The provisioning form's rules — and, as importantly, the rules it does NOT
 * have. Two of the three acceptance criteria for A2 are decided entirely here.
 */

function values(overrides: Partial<CreateStaffValues> = {}): CreateStaffValues {
  return {
    ...CREATE_STAFF_DEFAULTS,
    email: 'colleague@callschat.com',
    displayName: 'Sarah Connor',
    password: 'Str0ngPassword',
    ...overrides,
  }
}

describe('createStaffSchema', () => {
  it('accepts a minimal valid account', () => {
    expect(createStaffSchema.safeParse(values()).success).toBe(true)
  })

  it('accepts an empty permission grid', () => {
    /*
     * Denied by default (plan.md §8). An account with no module access is a
     * deliberate outcome, not an incomplete form — making the grid mandatory
     * would push an operator into granting something to get past validation.
     */
    expect(createStaffSchema.safeParse(values({ permissions: [] })).success).toBe(true)
  })

  it('applies the panel password rule, which is stricter than the server', () => {
    /*
     * `POST /admin/staff` checks length ≥ 8 and nothing else, so this exact
     * value is accepted live (staff_management_plan.md §3.5). The panel
     * refuses it: whoever chooses a colleague's first password is the only
     * person positioned to choose a good one.
     */
    const result = createStaffSchema.safeParse(values({ password: 'password' }))
    expect(result.success).toBe(false)
  })

  it('rejects SUPER_ADMIN as a role', () => {
    // The API rejects it too — the enum is ADMIN | MODERATOR (§2.3).
    const result = createStaffSchema.safeParse(
      values({ role: 'SUPER_ADMIN' as CreateStaffValues['role'] }),
    )
    expect(result.success).toBe(false)
  })

  it('rejects a display name of only whitespace', () => {
    expect(createStaffSchema.safeParse(values({ displayName: '   ' })).success).toBe(
      false,
    )
  })

  it('does NOT validate the phone format', () => {
    /*
     * The API stores `"nonsense"` verbatim (§8 O4). A client-side format rule
     * would reject numbers the backend keeps happily, and would imply a
     * validation that does not exist anywhere.
     */
    expect(createStaffSchema.safeParse(values({ phone: 'nonsense' })).success).toBe(
      true,
    )
  })

  it('defaults to the lower of the two roles and an empty grid', () => {
    expect(CREATE_STAFF_DEFAULTS.role).toBe('MODERATOR')
    expect(CREATE_STAFF_DEFAULTS.permissions).toEqual([])
  })
})

describe('buildCreatePayload', () => {
  it('omits a blank phone entirely rather than sending ""', () => {
    /*
     * The API does not validate the field, so `""` would be stored as somebody's
     * phone number rather than recording that they have none.
     */
    const payload = buildCreatePayload(values({ phone: '   ' }))
    expect('phone' in payload).toBe(false)
  })

  it('sends a trimmed phone when one was entered', () => {
    expect(buildCreatePayload(values({ phone: ' +12025550199 ' })).phone).toBe(
      '+12025550199',
    )
  })

  it('always sends permissions, including the empty array', () => {
    // Explicitly "no access", never an omission the server has to interpret.
    expect(buildCreatePayload(values({ permissions: [] })).permissions).toEqual([])
  })

  it('trims the email and display name but never the password', () => {
    const payload = buildCreatePayload(
      values({
        email: ' colleague@callschat.com ',
        displayName: ' Sarah Connor ',
        password: ' Str0ngPassword ',
      }),
    )

    expect(payload.email).toBe('colleague@callschat.com')
    expect(payload.displayName).toBe('Sarah Connor')
    // Trimming a password silently changes the credential the operator chose.
    expect(payload.password).toBe(' Str0ngPassword ')
  })
})
