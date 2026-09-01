import { describe, expect, it } from 'vitest'

import { compareVersions, isComparableVersion, isPolicyCoherent } from './semver'

describe('compareVersions', () => {
  it('ranks ordinary releases', () => {
    expect(compareVersions('2.4.0', '2.3.0')).toBe(1)
    expect(compareVersions('2.3.0', '2.4.0')).toBe(-1)
    expect(compareVersions('2.4.0', '2.4.0')).toBe(0)
  })

  it('compares segment by segment, not lexically', () => {
    // The bug this guards: "10" < "9" as strings.
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
    expect(compareVersions('2.0.0', '10.0.0')).toBe(-1)
  })

  it('treats missing trailing segments as zero', () => {
    expect(compareVersions('2.4', '2.4.0')).toBe(0)
    expect(compareVersions('2.4.1', '2.4')).toBe(1)
  })

  it('tolerates the v prefix the API accepts', () => {
    expect(compareVersions('v2.1.0', '2.1.0')).toBe(0)
    expect(compareVersions('V3.0.0', 'v2.9.9')).toBe(1)
  })

  it('compares the release core and ignores pre-release suffixes', () => {
    expect(compareVersions('2.4.0-beta.1', '2.4.0')).toBe(0)
    expect(compareVersions('2.5.0-rc1', '2.4.0')).toBe(1)
  })

  it('abstains rather than guessing on unrankable input', () => {
    /*
     * `null`, not `0`. The caller must be able to tell "equal" from "cannot
     * tell", because the second has to let the save through.
     */
    expect(compareVersions('latest', '2.4.0')).toBeNull()
    expect(compareVersions('2.4.0', '')).toBeNull()
    expect(compareVersions('2.x', '2.4.0')).toBeNull()
  })
})

describe('isComparableVersion', () => {
  it('accepts what the guard can rank', () => {
    expect(isComparableVersion('1.0.0')).toBe(true)
    expect(isComparableVersion('v2.4')).toBe(true)
    expect(isComparableVersion('3')).toBe(true)
  })

  it('rejects what it cannot', () => {
    expect(isComparableVersion('')).toBe(false)
    expect(isComparableVersion('   ')).toBe(false)
    expect(isComparableVersion('two point four')).toBe(false)
  })
})

describe('isPolicyCoherent', () => {
  it('accepts a minimum at or below the latest release', () => {
    expect(isPolicyCoherent('2.4.0', '2.1.0')).toBe(true)
    expect(isPolicyCoherent('2.4.0', '2.4.0')).toBe(true)
  })

  it('rejects the soft-brick the backend allows', () => {
    /*
     * The exact pair the live API accepted on 2026-09-01: every user is told
     * to install a build that does not exist.
     */
    expect(isPolicyCoherent('1.0.0', '99.0.0')).toBe(false)
  })

  it('does not block a save it cannot judge', () => {
    // A guard that cannot rank the pair must not stand in the operator's way.
    expect(isPolicyCoherent('nightly', '2.1.0')).toBe(true)
  })
})
