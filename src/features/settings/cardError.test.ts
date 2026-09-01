import { describe, expect, it } from 'vitest'

import { NetworkError, ValidationError } from '@/api/errors'

import { formLevelMessage } from './cardError'

/**
 * Which rejections the card has to explain itself.
 *
 * This matters more than it looks: the cross-field language error is now
 * unreachable through the UI, because the default language is chosen from the
 * supported list rather than typed. A rule that cannot be exercised by hand is
 * exactly the one that quietly stops working — so it is pinned here instead.
 */

describe('formLevelMessage', () => {
  it('says nothing when there is no error', () => {
    expect(formLevelMessage(null)).toBeNull()
    expect(formLevelMessage(undefined)).toBeNull()
  })

  it('surfaces the cross-field rejection that names no field', () => {
    // BAD_REQUEST, no `body/` prefix — nothing on the form can own this.
    const message = "Default language 'zz' must be included in supported languages."

    expect(formLevelMessage(new ValidationError(message))).toBe(message)
  })

  it('surfaces the root-level body rejection', () => {
    const message = 'body/ Expected object, received null'

    expect(formLevelMessage(new ValidationError(message))).toBe(message)
  })

  it('stays quiet when every part of the message maps to a control', () => {
    /*
     * Those render against their own inputs. Repeating them at card level
     * would say the same thing twice, in two places, about one mistake.
     */
    const error = new ValidationError(
      'body/appName App name is required, body/tosUrl Invalid Terms of Service URL',
    )

    expect(formLevelMessage(error)).toBeNull()
  })

  it('keeps an API error that already explains itself', () => {
    // "Could not reach the server" is more use than a generic apology.
    expect(formLevelMessage(new NetworkError())).toMatch(/Could not reach the server/)
  })

  it('gives a plain fallback for a failure with no usable message', () => {
    /*
     * An unexpected throw carries a message written for a developer. Showing
     * it to an operator explains nothing and can leak internals.
     */
    expect(formLevelMessage(new Error('Cannot read properties of undefined'))).toBe(
      'The change could not be saved. Please try again.',
    )
  })
})
