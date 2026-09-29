import { describe, expect, it } from 'vitest'

import type { BootstrapConfig } from '@/types/bootstrap'

import { activeDangers, evaluateClient, evaluateForceLogout } from './evaluate'

/**
 * The local reproduction of the server's evaluation ladder (plan.md §2.5).
 *
 * This is the only place the panel predicts something the server decides, so
 * the tests below are written against **observed live behaviour**, not against
 * the doc. Where the two disagreed, the service won — and the two rungs that
 * could not be probed without taking production down are marked as such.
 */

const BASE: BootstrapConfig = {
  id: 'cfg_1',
  platform: 'ANDROID',
  configVersion: 21,
  maintenanceMode: false,
  maintenanceMessage: null,
  minSupportedVersion: '1.0.0',
  latestVersion: '1.2.0',
  minBuildNumber: 5,
  latestBuildNumber: 12,
  forceUpdate: false,
  storeUrl: 'https://play.google.com/store/apps/details?id=com.callschat',
  blockedVersions: [],
  forceLogout: false,
  forceLogoutBeforeVersion: null,
  minAndroidSdk: 24,
  privacyPolicyUrl: 'https://callschat.com/privacy',
  termsUrl: 'https://callschat.com/terms',
  supportEmail: 'support@callschat.com',
  features: { chat: true, calls: true, signup: true },
  createdAt: '2026-09-26T09:27:21.633Z',
  updatedAt: '2026-09-28T03:52:10.118Z',
  updatedBy: 'cmt8orkov00004upco3oifg2v',
}

const config = (overrides: Partial<BootstrapConfig> = {}): BootstrapConfig => ({
  ...BASE,
  ...overrides,
})

describe('the ladder, in order', () => {
  it('1 — the forceUpdate switch outranks every version comparison', () => {
    /*
     * ⚠️ NOT verified live: setting `forceUpdate: true` on production would
     * have hard-blocked every mobile client for as long as the probe ran.
     * plan.md B3 requires this confirmed outside production.
     */
    const outcome = evaluateClient(config({ forceUpdate: true }), {
      version: '9.9.9',
      buildNumber: 999,
    })

    expect(outcome.status).toBe('forced')
    expect(outcome.reason).toBe('force-update-switch')
  })

  it('2 — a blocked version forces, matched as an exact string', () => {
    // ✅ Verified live: a client reporting a blocked version got "forced".
    const blocked = config({ blockedVersions: ['1.1.0', 'garbage'] })

    expect(evaluateClient(blocked, { version: '1.1.0', buildNumber: 12 }).reason).toBe(
      'blocked-version',
    )
    /*
     * Deliberately not a SemVer comparison: `1.1.1` is not blocked by an entry
     * of `1.1.0`, and the non-SemVer entry blocks only a client reporting that
     * literal string — which is to say, nobody (plan.md §3.4).
     */
    expect(evaluateClient(blocked, { version: '1.1.1', buildNumber: 12 }).status).toBe(
      'optional',
    )
  })

  it('3 — below the supported floor forces', () => {
    // ✅ Verified live: v0.9.0 against minSupportedVersion 1.0.0 → "forced".
    const outcome = evaluateClient(config(), { version: '0.9.0', buildNumber: 12 })

    expect(outcome.status).toBe('forced')
    expect(outcome.reason).toBe('below-min-version')
  })

  it('4 — below the build floor forces, even on a supported version', () => {
    const outcome = evaluateClient(config(), { version: '1.2.0', buildNumber: 4 })

    expect(outcome.status).toBe('forced')
    expect(outcome.reason).toBe('below-min-build')
  })

  it('5 — behind the newest release is optional, not forced', () => {
    const outcome = evaluateClient(config(), { version: '1.1.0', buildNumber: 12 })

    expect(outcome.status).toBe('optional')
    expect(outcome.reason).toBe('behind-latest-version')
  })

  it('6 — same version, older build is optional', () => {
    const outcome = evaluateClient(config(), { version: '1.2.0', buildNumber: 11 })

    expect(outcome.status).toBe('optional')
    expect(outcome.reason).toBe('behind-latest-build')
  })

  it('7 — current is none', () => {
    // ✅ Verified live.
    expect(evaluateClient(config(), { version: '1.2.0', buildNumber: 12 }).status).toBe(
      'none',
    )
  })

  it('7 — AHEAD of the newest release is also none', () => {
    /*
     * ✅ Verified live: v2.0.0 against latestVersion 1.0.0 answered "none".
     * It matters for anyone running an internal build — the panel must not
     * tell them to downgrade.
     */
    expect(
      evaluateClient(config(), { version: '9.9.9', buildNumber: 999 }).status,
    ).toBe('none')
  })
})

describe('precedence, where two rungs could both match', () => {
  it('reports forced rather than optional when both apply', () => {
    // Below the floor AND behind the latest: the stronger answer must win.
    const outcome = evaluateClient(config(), { version: '0.5.0', buildNumber: 1 })
    expect(outcome.status).toBe('forced')
  })

  it('prefers the blocklist over the version floor, so the UI can say which', () => {
    /*
     * Both would force. The reason decides which field an operator has to edit
     * to undo it, which is the whole point of reporting one.
     */
    const outcome = evaluateClient(config({ blockedVersions: ['0.5.0'] }), {
      version: '0.5.0',
      buildNumber: 1,
    })
    expect(outcome.reason).toBe('blocked-version')
  })
})

describe('fail-open on an unparseable version', () => {
  it('treats a garbage version as up to date, because the server does', () => {
    /*
     * ⚠️ ✅ Verified live: `app-version: not-a-version` answered `"none"` —
     * no 400, no forced update. A malformed policy therefore cannot lock
     * anyone out, but the panel also cannot lean on the server to reject
     * nonsense, which is why the form validates before sending.
     */
    expect(
      evaluateClient(config(), { version: 'not-a-version', buildNumber: 12 }).status,
    ).toBe('none')
    expect(evaluateClient(config(), { version: '', buildNumber: 12 }).status).toBe(
      'none',
    )
  })

  it('still applies the build-number rungs, which do not need SemVer', () => {
    // Build numbers are integers; a bad version string does not excuse them.
    expect(
      evaluateClient(config(), { version: 'garbage', buildNumber: 1 }).status,
    ).toBe('forced')
  })
})

describe('force logout is its own axis', () => {
  it('is true below forceLogoutBeforeVersion, alongside a forced update', () => {
    /*
     * ✅ Verified live: a client below the threshold got `force_logout: true`
     * AND `status: "forced"` in the same response. Folding one into the other
     * would hide it.
     */
    const outcome = evaluateClient(config({ forceLogoutBeforeVersion: '1.0.0' }), {
      version: '0.9.0',
      buildNumber: 12,
    })

    expect(outcome.forceLogout).toBe(true)
    expect(outcome.status).toBe('forced')
  })

  it('is false for a client at or above the threshold', () => {
    // ✅ Verified live.
    expect(
      evaluateForceLogout(config({ forceLogoutBeforeVersion: '1.0.0' }), {
        version: '1.0.0',
        buildNumber: 12,
      }),
    ).toBe(false)
  })

  it('is true for everyone when the global switch is on', () => {
    expect(
      evaluateForceLogout(config({ forceLogout: true }), {
        version: '9.9.9',
        buildNumber: 999,
      }),
    ).toBe(true)
  })

  it('is false when no threshold is set', () => {
    expect(evaluateForceLogout(config(), { version: '0.0.1', buildNumber: 1 })).toBe(
      false,
    )
  })
})

describe('activeDangers', () => {
  it('is empty on a healthy config', () => {
    expect(activeDangers(config())).toEqual([])
  })

  it('names every switch that is currently stopping the product', () => {
    expect(
      activeDangers(
        config({ maintenanceMode: true, forceUpdate: true, forceLogout: true }),
      ),
    ).toEqual(['maintenanceMode', 'forceUpdate', 'forceLogout'])
  })

  it('names just the one that is on', () => {
    expect(activeDangers(config({ maintenanceMode: true }))).toEqual([
      'maintenanceMode',
    ])
  })
})
