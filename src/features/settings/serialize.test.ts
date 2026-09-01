import { describe, expect, it } from 'vitest'

import {
  buildChatPayload,
  buildGeneralPayload,
  buildMaintenancePayload,
  buildPlatformPayload,
  buildSmsPayload,
  buildVersionPolicyPayload,
  isMaskedSecret,
  normaliseFileType,
} from './serialize'

/**
 * Payload shape tests.
 *
 * These matter more than the usual unit test because the failures they guard
 * against are invisible from a response: the server answers 200 to a payload
 * that clears the wrong field, omits one it then wipes, or writes a masked
 * string over a live credential. Only the outgoing body shows the bug.
 */

const GENERAL_BASE = {
  appName: 'CallsChat',
  supportEmail: 'support@callschat.com',
  supportPhone: '',
  tosUrl: '',
  privacyPolicyUrl: '',
}

describe('buildGeneralPayload', () => {
  it('clears blank fields with "" — the sentinel /general honours', () => {
    const payload = buildGeneralPayload(GENERAL_BASE)

    expect(payload.supportPhone).toBe('')
    expect(payload.tosUrl).toBe('')
    expect(payload.privacyPolicyUrl).toBe('')
  })

  it('never sends null, which /general refuses for supportEmail', () => {
    const payload = buildGeneralPayload(GENERAL_BASE)

    expect(Object.values(payload)).not.toContain(null)
  })

  it('trims what the operator typed', () => {
    const payload = buildGeneralPayload({
      ...GENERAL_BASE,
      appName: '  CallsChat Pro  ',
      supportPhone: ' +12025550199 ',
    })

    expect(payload.appName).toBe('CallsChat Pro')
    expect(payload.supportPhone).toBe('+12025550199')
  })
})

describe('buildMaintenancePayload', () => {
  const BASE = {
    maintenanceMode: false,
    maintenanceMessage: '',
    maintenanceStartsAt: '',
    maintenanceEndsAt: '',
  }

  it('sends a full ISO instant, not the date a picker would give', () => {
    /*
     * `{"maintenanceStartsAt":"2026-09-01"}` is rejected with
     * `Invalid datetime` — which is exactly what an <input type="date"> emits.
     */
    const payload = buildMaintenancePayload({
      ...BASE,
      maintenanceStartsAt: '2026-09-01T02:00',
    })

    expect(payload.maintenanceStartsAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    )
  })

  it('clears an empty window with ""', () => {
    const payload = buildMaintenancePayload(BASE)

    expect(payload.maintenanceStartsAt).toBe('')
    expect(payload.maintenanceEndsAt).toBe('')
  })

  it('passes an unparseable value through so the server message wins', () => {
    const payload = buildMaintenancePayload({ ...BASE, maintenanceStartsAt: 'soon' })

    expect(payload.maintenanceStartsAt).toBe('soon')
  })
})

describe('normaliseFileType', () => {
  it('mirrors the server: lowercase, trimmed, leading dot stripped', () => {
    expect(normaliseFileType('  .PDF ')).toBe('pdf')
    expect(normaliseFileType('..JPG')).toBe('jpg')
    expect(normaliseFileType('mp4')).toBe('mp4')
  })
})

describe('buildChatPayload', () => {
  it('deduplicates, which the server does not', () => {
    /*
     * The live service stored ["jpg","png","jpg","jpg"] verbatim. Deduping is
     * therefore ours to do, or the list grows every time someone saves.
     */
    const payload = buildChatPayload({
      maxMediaFileSizeMB: 25,
      allowedFileTypes: ['.JPG', ' png ', 'jpg', 'jpg'],
    })

    expect(payload.allowedFileTypes).toEqual(['jpg', 'png'])
  })

  it('drops empty entries rather than sending them', () => {
    const payload = buildChatPayload({
      maxMediaFileSizeMB: 25,
      allowedFileTypes: ['pdf', '   ', '.'],
    })

    expect(payload.allowedFileTypes).toEqual(['pdf'])
  })
})

describe('buildPlatformPayload', () => {
  const BASE = {
    defaultLanguage: 'en',
    supportedLanguages: ['en', 'bn'],
    playStoreUrl: '',
    appStoreUrl: '',
    paymentEnabled: false,
    paymentProvider: 'none',
    subscriptionPlansEnabled: false,
  }

  it('clears store URLs with null — "" is a 400 on this endpoint', () => {
    const payload = buildPlatformPayload(BASE)

    // The exact inverse of /general. This is the asymmetry the file exists for.
    expect(payload.playStoreUrl).toBeNull()
    expect(payload.appStoreUrl).toBeNull()
  })

  it('never sends "" for a store URL', () => {
    const payload = buildPlatformPayload({ ...BASE, appStoreUrl: '   ' })

    expect(payload.appStoreUrl).not.toBe('')
  })

  it('lowercases and dedupes language codes', () => {
    const payload = buildPlatformPayload({
      ...BASE,
      defaultLanguage: 'EN',
      supportedLanguages: ['EN', 'en', 'bn'],
    })

    expect(payload.defaultLanguage).toBe('en')
    expect(payload.supportedLanguages).toEqual(['en', 'bn'])
  })
})

describe('buildVersionPolicyPayload', () => {
  it('always sends all six keys, because this PATCH replaces', () => {
    /*
     * Sending only the three required fields wiped buildNumber and
     * releaseNotes on the live iOS policy. An omitted key is data loss here,
     * never "leave it alone".
     */
    const payload = buildVersionPolicyPayload({
      platform: 'ANDROID',
      latestVersion: '2.4.0',
      buildNumber: '',
      minRequiredVersion: '2.1.0',
      forceUpdate: false,
      releaseNotes: '',
    })

    expect(Object.keys(payload).sort()).toEqual([
      'buildNumber',
      'forceUpdate',
      'latestVersion',
      'minRequiredVersion',
      'platform',
      'releaseNotes',
    ])
  })

  it('keeps buildNumber a string — a number is rejected', () => {
    const payload = buildVersionPolicyPayload({
      platform: 'IOS',
      latestVersion: '2.4.0',
      buildNumber: '45',
      minRequiredVersion: '2.1.0',
      forceUpdate: true,
      releaseNotes: 'Notes',
    })

    expect(payload.buildNumber).toBe('45')
    expect(typeof payload.buildNumber).toBe('string')
  })
})

describe('buildSmsPayload', () => {
  const BASE = {
    provider: 'BULKGATE' as const,
    isEnabled: true,
    bulkgateAppId: '35684',
    bulkgateAppToken: '',
    bulkgateSenderId: 'gSystem',
    twilioAccountSid: '',
    twilioAuthToken: '',
    twilioFromNumber: '',
  }

  it('omits an untouched secret entirely', () => {
    const payload = buildSmsPayload(BASE)

    // Absent, not empty — an empty string would overwrite the stored token.
    expect(payload).not.toHaveProperty('bulkgateAppToken')
  })

  it('never writes a masked value back over a real credential', () => {
    const payload = buildSmsPayload({
      ...BASE,
      bulkgateAppToken: '••••••••••••FNKl',
    })

    expect(payload).not.toHaveProperty('bulkgateAppToken')
  })

  it('sends a secret the operator actually retyped', () => {
    const payload = buildSmsPayload({ ...BASE, bulkgateAppToken: 'new-token-value' })

    expect(payload['bulkgateAppToken']).toBe('new-token-value')
  })

  it('sends only the selected provider’s credentials', () => {
    const payload = buildSmsPayload({
      ...BASE,
      provider: 'TWILIO',
      twilioAccountSid: 'ACxxx',
      twilioFromNumber: '+12025550199',
    })

    // Switching provider must not post half-filled BulkGate fields.
    expect(payload).not.toHaveProperty('bulkgateAppId')
    expect(payload['twilioAccountSid']).toBe('ACxxx')
  })

  it('sends neither provider’s credentials when disabled', () => {
    const payload = buildSmsPayload({ ...BASE, provider: 'DISABLED' })

    expect(Object.keys(payload).sort()).toEqual(['isEnabled', 'provider'])
  })
})

describe('isMaskedSecret', () => {
  it('recognises the server mask', () => {
    expect(isMaskedSecret('••••••••••••FNKl')).toBe(true)
    expect(isMaskedSecret('  ••••1234')).toBe(true)
  })

  it('does not mistake a real secret for a mask', () => {
    expect(isMaskedSecret('bulkgate-app-token')).toBe(false)
    expect(isMaskedSecret('')).toBe(false)
  })
})
