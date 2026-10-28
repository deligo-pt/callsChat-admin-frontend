import { describe, expect, it, vi } from 'vitest'

import { catalogAssetUrl, isLottieAsset } from './mediaUrl'

/**
 * Catalog asset URLs — phase G1.
 *
 * ⚠️ The whole module exists because the backend returns two URL shapes for
 * the same kind of asset (plan.md O10), and because `lib/safeUrl.ts` refuses
 * relative URLs **on purpose**. These tests exist to prove the resolution is
 * explicit rather than a loosened guard.
 */

vi.mock('@/env', () => ({
  env: { VITE_API_BASE_URL: 'https://test-api.callschat.com' },
}))

describe('resolving a stored catalog path', () => {
  it('joins a root-relative path to the API origin', () => {
    /*
     * The exact value on every live gift, measured 2026-10-28.
     */
    expect(
      catalogAssetUrl('/api/v1/media/download/catalog/gifts/teddy_bear.json'),
    ).toBe(
      'https://test-api.callschat.com/api/v1/media/download/catalog/gifts/teddy_bear.json',
    )
  })

  it('does NOT double the /api/v1 prefix', () => {
    /*
     * ⚠️ **The bug this file caught during G1.** `API_URL` in `env.ts` already
     * ends in `/api/v1`, and every stored catalog path already begins with it.
     * Joining the two produces `/api/v1/api/v1/media/...`, which the live
     * server answers `404` — verified both ways on 2026-10-28. The doubled
     * form is a plausible-looking URL that renders nothing at all.
     */
    const resolved = catalogAssetUrl('/api/v1/media/download/catalog/gifts/x.json')
    expect(resolved).not.toContain('/api/v1/api/v1')
    expect(resolved?.match(/\/api\/v1/g)).toHaveLength(1)
  })

  it('passes an absolute https URL through, as upload-url returns', () => {
    const uploaded =
      'https://media.callschat.com/calls-chat-media/catalog/gifts/1793_x.png'
    expect(catalogAssetUrl(uploaded)).toBe(uploaded)
  })
})

describe('what it refuses', () => {
  it('refuses a javascript: asset', () => {
    expect(catalogAssetUrl('javascript:alert(document.domain)')).toBeNull()
  })

  it('refuses a protocol-relative URL, which looks like a path', () => {
    /*
     * ⚠️ `//evil.com/x.json` starts with a slash, so a naive "is it relative"
     * check joins it to our API base — and the URL parser then resolves it to
     * `https://evil.com/x.json`, discarding the base entirely. It is checked
     * before the leading-slash branch for exactly this reason.
     */
    expect(catalogAssetUrl('//evil.com/payload.json')).toBeNull()
  })

  it('refuses http, data and bare hosts', () => {
    expect(catalogAssetUrl('http://test-api.callschat.com/x.json')).toBeNull()
    expect(catalogAssetUrl('data:application/json,{}')).toBeNull()
    expect(catalogAssetUrl('evil.com/x.json')).toBeNull()
  })

  it('refuses nothing at all', () => {
    expect(catalogAssetUrl(null)).toBeNull()
    expect(catalogAssetUrl(undefined)).toBeNull()
    expect(catalogAssetUrl('   ')).toBeNull()
  })
})

describe('telling a Lottie from an image', () => {
  it('recognises the catalog’s .json assets', () => {
    /*
     * ⚠️ Every live gift's `iconUrl` IS its `animationUrl`, and both are
     * `.json`. There is no static thumbnail in this catalog, so a list cannot
     * reach for `<img>` without checking.
     */
    expect(isLottieAsset('/api/v1/media/download/catalog/gifts/teddy_bear.json')).toBe(
      true,
    )
    expect(isLottieAsset('/api/v1/media/download/catalog/emojis/blushing.json')).toBe(
      true,
    )
  })

  it('sees past a pre-signed query string', () => {
    /* An upload URL carries `?X-Amz-...` after the extension. */
    expect(
      isLottieAsset('https://media.callschat.com/x/y.json?X-Amz-Signature=abc'),
    ).toBe(true)
    expect(
      isLottieAsset('https://media.callschat.com/x/y.png?X-Amz-Signature=abc'),
    ).toBe(false)
  })

  it('treats an image as an image', () => {
    expect(isLottieAsset('/api/v1/media/download/catalog/packs/cover.png')).toBe(false)
    expect(isLottieAsset('/api/v1/media/download/catalog/packs/cover.WEBP')).toBe(false)
    expect(isLottieAsset(null)).toBe(false)
  })
})
