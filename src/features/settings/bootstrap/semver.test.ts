import { describe, expect, it } from 'vitest'

import { compareSemver, isBelow, isValidSemver, parseSemver } from './semver'

/**
 * The version comparison the whole module rests on.
 *
 * Two different consumers, two different consequences of getting it wrong:
 * `isValidSemver` decides what the panel will **send** (a mismatch with the
 * server is a 400 from a field that looked fine), and `compareSemver` decides
 * what the panel **predicts** (a mismatch is a preview that lies about who
 * gets force-updated).
 */

describe('parseSemver', () => {
  it('accepts the two shapes the API names in its own error message', () => {
    // "Must be a valid Semantic Version (e.g. 1.0.0, 1.2.3-beta.1)"
    expect(parseSemver('1.0.0')).toEqual({
      major: 1,
      minor: 0,
      patch: 0,
      prerelease: [],
    })
    expect(parseSemver('1.2.3-beta.1')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: ['beta', '1'],
    })
  })

  it('tolerates surrounding whitespace, because a pasted version has it', () => {
    expect(parseSemver('  1.4.2  ')?.minor).toBe(4)
  })

  it('returns null rather than guessing', () => {
    for (const value of [
      'garbage',
      '1.2',
      '1',
      '',
      'v1.0.0',
      '1.0.0.0',
      '01.0.0',
      '1.0.0+build.5',
      '-1.0.0',
    ]) {
      expect(parseSemver(value), value).toBeNull()
    }
  })
})

describe('isValidSemver', () => {
  it('agrees with the server on what it will accept', () => {
    expect(isValidSemver('1.0.0')).toBe(true)
    expect(isValidSemver('1.2.3-beta.1')).toBe(true)
  })

  it('refuses the exact values the live API rejected', () => {
    expect(isValidSemver('not-a-version')).toBe(false)
    expect(isValidSemver(null)).toBe(false)
    expect(isValidSemver(undefined)).toBe(false)
  })

  it('refuses the value the live API wrongly ACCEPTED into blockedVersions', () => {
    /*
     * ⚠️ plan.md §3.4. `["garbage","1.2"]` was stored by the server. Such an
     * entry blocks nobody, so the panel refuses to add one — this is the check
     * that makes the tag input honest.
     */
    expect(isValidSemver('garbage')).toBe(false)
    expect(isValidSemver('1.2')).toBe(false)
  })
})

describe('compareSemver', () => {
  it('orders numerically, not as strings', () => {
    /*
     * ⚠️ The comparison a naive implementation gets wrong. As strings,
     * "1.10.0" < "1.2.0" — which on this screen is the difference between
     * force-updating everyone on the newest build and force-updating nobody.
     */
    expect(compareSemver('1.2.0', '1.10.0')).toBe(-1)
    expect(compareSemver('1.10.0', '1.2.0')).toBe(1)
    expect(compareSemver('2.0.0', '10.0.0')).toBe(-1)
  })

  it('orders across all three fields', () => {
    expect(compareSemver('1.0.0', '2.0.0')).toBe(-1)
    expect(compareSemver('1.1.0', '1.0.9')).toBe(1)
    expect(compareSemver('1.0.1', '1.0.2')).toBe(-1)
    expect(compareSemver('3.4.5', '3.4.5')).toBe(0)
  })

  it('places a pre-release below its own release', () => {
    expect(compareSemver('1.2.3-beta.1', '1.2.3')).toBe(-1)
    expect(compareSemver('1.2.3', '1.2.3-beta.1')).toBe(1)
  })

  it('orders pre-release identifiers per the spec', () => {
    // Numeric identifiers sort numerically and below alphanumeric ones.
    expect(compareSemver('1.0.0-alpha.2', '1.0.0-alpha.10')).toBe(-1)
    expect(compareSemver('1.0.0-alpha.2', '1.0.0-alpha.beta')).toBe(-1)
    expect(compareSemver('1.0.0-alpha', '1.0.0-beta')).toBe(-1)
    // A longer tag outranks its own prefix.
    expect(compareSemver('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1)
  })

  it('returns null when either side is unparseable, never a silent zero', () => {
    /*
     * A `0` here would read as "equal", which would quietly mean "up to date"
     * in `evaluate.ts`. The caller has to decide what unknown means.
     */
    expect(compareSemver('garbage', '1.0.0')).toBeNull()
    expect(compareSemver('1.0.0', 'garbage')).toBeNull()
    expect(compareSemver('', '')).toBeNull()
  })
})

describe('isBelow', () => {
  it('is false for an unparseable version, never a guess', () => {
    expect(isBelow('garbage', '9.9.9')).toBe(false)
    expect(isBelow('1.0.0', 'garbage')).toBe(false)
  })

  it('is false for an equal version', () => {
    expect(isBelow('1.0.0', '1.0.0')).toBe(false)
  })
})
