import { describe, expect, it, vi } from 'vitest'

import { ValidationError } from '@/api/errors'

import { applyServerFieldErrors, generalSettingsSchema } from './schemas'

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

describe('applyServerFieldErrors', () => {
  const FIELDS = ['appName', 'supportEmail', 'tosUrl']

  it('routes each concatenated failure to its own control', () => {
    const setError = vi.fn()
    const error = new ValidationError(
      'body/appName App name is required, body/tosUrl Invalid Terms of Service URL',
    )

    const matched = applyServerFieldErrors(error, setError, FIELDS)

    expect(matched).toBe(true)
    expect(setError).toHaveBeenCalledWith('appName', {
      type: 'server',
      message: 'App name is required',
    })
    expect(setError).toHaveBeenCalledWith('tosUrl', {
      type: 'server',
      message: 'Invalid Terms of Service URL',
    })
  })

  it('ignores a field this form does not render', () => {
    // Setting an error on a control that does not exist hides it entirely.
    const setError = vi.fn()
    const error = new ValidationError('body/maxMediaFileSizeMB Minimum is 1MB')

    expect(applyServerFieldErrors(error, setError, FIELDS)).toBe(false)
    expect(setError).not.toHaveBeenCalled()
  })

  it('leaves the prefix-less cross-field message for the card', () => {
    /*
     * "Default language 'zz' must be included in supported languages." has no
     * field to own it. Guessing one would put the message somewhere the
     * operator has no way to act on.
     */
    const setError = vi.fn()
    const error = new ValidationError(
      "Default language 'zz' must be included in supported languages.",
    )

    expect(applyServerFieldErrors(error, setError, FIELDS)).toBe(false)
    expect(setError).not.toHaveBeenCalled()
  })

  it('leaves the root body rejection for the card', () => {
    const setError = vi.fn()
    const error = new ValidationError('body/ Expected object, received null')

    expect(applyServerFieldErrors(error, setError, FIELDS)).toBe(false)
  })
})
