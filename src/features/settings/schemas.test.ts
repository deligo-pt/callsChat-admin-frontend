import { describe, expect, it } from 'vitest'

import { generalSettingsSchema } from './schemas'

/**
 * Form-schema rules, and the bridge from a server rejection to a control.
 */

const VALID = {
  appName: 'CallsChat',
  supportEmail: 'support@callschat.com',
  supportPhone: '',
  tosUrl: '',
  privacyPolicyUrl: '',
}

describe('generalSettingsSchema', () => {
  it('accepts the live production record', () => {
    expect(generalSettingsSchema.safeParse(VALID).success).toBe(true)
  })

  it('allows every optional field to be blank', () => {
    // Blank is how a field is cleared — it must never read as invalid.
    const result = generalSettingsSchema.safeParse({
      ...VALID,
      supportPhone: '',
      tosUrl: '',
      privacyPolicyUrl: '',
    })

    expect(result.success).toBe(true)
  })

  it('rejects a one-character app name the server would accept', () => {
    /*
     * ADDED client-side. `"x"` was stored on production during contract
     * testing — this is the brand name every client displays.
     */
    const result = generalSettingsSchema.safeParse({ ...VALID, appName: 'x' })

    expect(result.success).toBe(false)
  })

  it('rejects a phone the server would accept unvalidated', () => {
    // The API stored "12345" without complaint.
    expect(
      generalSettingsSchema.safeParse({ ...VALID, supportPhone: '12345' }).success,
    ).toBe(false)
    expect(
      generalSettingsSchema.safeParse({ ...VALID, supportPhone: '+12025550199' })
        .success,
    ).toBe(true)
  })

  it('requires a support email, which the API cannot clear', () => {
    expect(
      generalSettingsSchema.safeParse({ ...VALID, supportEmail: '' }).success,
    ).toBe(false)
    expect(
      generalSettingsSchema.safeParse({ ...VALID, supportEmail: 'not-an-email' })
        .success,
    ).toBe(false)
  })

  it('requires a full URL for the legal links', () => {
    expect(
      generalSettingsSchema.safeParse({ ...VALID, tosUrl: 'callschat.com' }).success,
    ).toBe(false)
    expect(
      generalSettingsSchema.safeParse({
        ...VALID,
        tosUrl: 'https://callschat.com/terms',
      }).success,
    ).toBe(true)
  })
})
