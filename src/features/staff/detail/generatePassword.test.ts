import { describe, expect, it } from 'vitest'

import { passwordSchema } from '@/lib/passwordPolicy'

import { generatePassword } from './generatePassword'

/**
 * The generator has one job the panel depends on and one the operator does.
 */

const SAMPLES = Array.from({ length: 200 }, () => generatePassword())

describe('generatePassword', () => {
  it('always satisfies the panel’s own password rule', () => {
    /*
     * Not "usually". A generator that produces a rejected password once every
     * few hundred uses is a bug nobody can reproduce — hence the forced
     * upper/lower/digit in the first group rather than relying on the draw.
     */
    for (const password of SAMPLES) {
      expect(passwordSchema.safeParse(password).success).toBe(true)
    }
  })

  it('omits characters that cannot be told apart when read aloud', () => {
    /*
     * This value gets dictated over a call or re-typed from a screenshot.
     * `0/O`, `1/l/I` and `5/S` turn a working credential into a support
     * request.
     */
    for (const password of SAMPLES) {
      expect(password).not.toMatch(/[0O1lI5S]/)
    }
  })

  it('is chunked, so it can be read out in groups', () => {
    expect(SAMPLES[0]).toMatch(/^[A-Za-z0-9]{4}(-[A-Za-z0-9]{4}){3}$/)
  })

  it('does not repeat', () => {
    // A generator seeded per-render would collide; this one draws from crypto.
    expect(new Set(SAMPLES).size).toBe(SAMPLES.length)
  })
})
