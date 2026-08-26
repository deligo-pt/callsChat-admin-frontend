import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  isExpired,
  parseExpiresIn,
  resetSessionForTests,
  setSession,
} from './tokenStore'

beforeEach(() => {
  resetSessionForTests()
})

afterEach(() => {
  vi.useRealTimers()
  resetSessionForTests()
})

describe('parseExpiresIn', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-25T12:00:00Z'))
  })

  it('parses the "7d" the API actually sends', () => {
    const expected = new Date('2026-09-01T12:00:00Z').getTime()
    expect(parseExpiresIn('7d')).toBe(expected)
  })

  it.each([
    ['30s', 30_000],
    ['15m', 900_000],
    ['2h', 7_200_000],
    ['500ms', 500],
  ])('parses %s', (input, offset) => {
    expect(parseExpiresIn(input)).toBe(Date.now() + offset)
  })

  it('treats a bare number as seconds', () => {
    expect(parseExpiresIn('60')).toBe(Date.now() + 60_000)
  })

  it.each([undefined, '', 'soon', '-5d', '0d', 'NaNd'])(
    'returns null for %s rather than guessing',
    (input) => {
      /*
       * null means "no known expiry", which falls back to trusting the
       * server's 401. Guessing an expiry in either direction is worse: too
       * short signs the operator out early, too long presents a dead token.
       */
      expect(parseExpiresIn(input)).toBeNull()
    },
  )
})

describe('session storage', () => {
  it('round-trips a session', () => {
    setSession({ accessToken: 'a', refreshToken: 'r', expiresAt: null })
    expect(getAccessToken()).toBe('a')
    expect(getRefreshToken()).toBe('r')
  })

  it('withholds an access token that has already expired', () => {
    setSession({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() - 1000 })

    // Presenting a known-dead credential just turns every load into a 401.
    expect(getAccessToken()).toBeNull()
    expect(isExpired()).toBe(true)

    // The refresh token is still handed out — renewing is the whole point.
    expect(getRefreshToken()).toBe('r')
  })

  it('returns a token that has not expired yet', () => {
    setSession({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 60_000 })
    expect(getAccessToken()).toBe('a')
    expect(isExpired()).toBe(false)
  })

  it('treats a null expiry as "no known expiry", not as expired', () => {
    setSession({ accessToken: 'a', refreshToken: null, expiresAt: null })
    expect(isExpired()).toBe(false)
    expect(getAccessToken()).toBe('a')
  })

  it('clears everything on sign-out', () => {
    setSession({ accessToken: 'a', refreshToken: 'r', expiresAt: null })
    clearSession()
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })

  it('survives unparseable persisted data instead of throwing', () => {
    globalThis.sessionStorage.setItem('callchat.admin.session', '{not json')
    resetSessionForTests()
    expect(getAccessToken()).toBeNull()
  })

  it('ignores persisted data missing an access token', () => {
    globalThis.sessionStorage.setItem('callchat.admin.session', '{"refreshToken":"r"}')
    resetSessionForTests()
    expect(getAccessToken()).toBeNull()
  })
})
