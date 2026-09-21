import { describe, expect, it } from 'vitest'

import { splitDeviceInfo, splitDeviceLine } from './labels'

/**
 * `userDeviceInfo` — a free-text column the mobile app has already reformatted
 * once. Both formats are live in production at the same time, so both are
 * asserted here, and the new one exactly as it arrived on 2026-09-21.
 */

/** Captured verbatim from a live ticket filed by the Android app. */
const CURRENT_FORMAT = [
  'App: CallsChat v1.1.19 (Build 12) [com.codextechit.callchat]',
  'Network: Wi-Fi (Active)',
  'Locale: en_GB',
  'OS: Android 13 (SDK 33, Patch: 2024-10-01)',
  'Device: Xiaomi 2201117TG (Brand: Redmi, Product: spes_global)',
  'Hardware: qcom | Board: spes | Device: spes',
  'Architecture: arm64-v8a, armeabi-v7a, armeabi',
  'Type: Physical Device (Low RAM: No)',
].join('\n')

/** The format the probe tickets still carry. */
const LEGACY_FORMAT = 'device: Xiaomi 2201117TG, os: Android 13, appVersion: 2.3.0'

describe('splitDeviceInfo', () => {
  it('splits the current format on line breaks — one entry per line', () => {
    const lines = splitDeviceInfo(CURRENT_FORMAT)

    expect(lines).toHaveLength(8)
    expect(lines[0]).toBe(
      'App: CallsChat v1.1.19 (Build 12) [com.codextechit.callchat]',
    )
    expect(lines[7]).toBe('Type: Physical Device (Low RAM: No)')
  })

  it('never cuts a line at a comma inside its value', () => {
    /*
     * ⚠️ The regression. The old splitter used commas, and this format puts
     * commas inside values — it produced `"OS: Android 13 (SDK 33"` and a bare
     * `"armeabi-v7a"`. Both lines must survive whole.
     */
    const lines = splitDeviceInfo(CURRENT_FORMAT)

    expect(lines).toContain('OS: Android 13 (SDK 33, Patch: 2024-10-01)')
    expect(lines).toContain('Architecture: arm64-v8a, armeabi-v7a, armeabi')
    expect(lines).not.toContain('armeabi-v7a')
    expect(lines.some((line) => line.endsWith('(SDK 33'))).toBe(false)
  })

  it('still splits the legacy single-line format on commas', () => {
    expect(splitDeviceInfo(LEGACY_FORMAT)).toEqual([
      'device: Xiaomi 2201117TG',
      'os: Android 13',
      'appVersion: 2.3.0',
    ])
  })

  it('tolerates Windows line endings and blank lines', () => {
    expect(splitDeviceInfo('App: CallsChat\r\n\r\nOS: Android 14\r\n')).toEqual([
      'App: CallsChat',
      'OS: Android 14',
    ])
  })

  it('returns a single unstructured string whole', () => {
    expect(splitDeviceInfo('Samsung Galaxy S23')).toEqual(['Samsung Galaxy S23'])
  })

  it('returns nothing for an empty or whitespace string', () => {
    expect(splitDeviceInfo('')).toEqual([])
    expect(splitDeviceInfo('   \n  ')).toEqual([])
  })
})

describe('splitDeviceLine', () => {
  it('splits at the first separator only, keeping colons inside the value', () => {
    // `Patch: 2024-10-01` belongs to the OS value, not to a second field.
    expect(splitDeviceLine('OS: Android 13 (SDK 33, Patch: 2024-10-01)')).toEqual({
      label: 'OS',
      value: 'Android 13 (SDK 33, Patch: 2024-10-01)',
    })
  })

  it('keeps pipes and brackets inside the value untouched', () => {
    expect(splitDeviceLine('Hardware: qcom | Board: spes | Device: spes')).toEqual({
      label: 'Hardware',
      value: 'qcom | Board: spes | Device: spes',
    })
  })

  it('returns null for a line with no separator, so it renders whole', () => {
    /*
     * A reading aid, not a parse: anything it does not recognise is shown as
     * written rather than dropped.
     */
    expect(splitDeviceLine('Samsung Galaxy S23')).toBeNull()
    expect(splitDeviceLine(': no label')).toBeNull()
    expect(splitDeviceLine('Label: ')).toBeNull()
  })
})
