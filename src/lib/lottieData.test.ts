import { describe, expect, it } from 'vitest'

import { MAX_LOTTIE_BYTES, parseLottie } from './lottieData'

/**
 * The Lottie document guard — phase G2.
 *
 * The minimal shape below mirrors the live files' top level (all 8 measured
 * 2026-10-28: `w`/`h` 2560, `fr` 60, precomp assets with no image paths).
 */

const base = { v: '5.7.4', w: 2560, h: 2560, fr: 60, ip: 0, op: 302, layers: [] }

function doc(extra: Record<string, unknown> = {}) {
  return JSON.stringify({ ...base, ...extra })
}

describe('what counts as a Lottie document', () => {
  it('accepts the live top-level shape', () => {
    expect(parseLottie(doc())).not.toBeNull()
  })

  it.each([
    ['not JSON', '{nope'],
    ['an array', '[]'],
    ['a string', '"teddy"'],
    ['null', 'null'],
    ['no layers', JSON.stringify({ ...base, layers: undefined })],
    ['layers not an array', doc({ layers: {} })],
    ['no width', JSON.stringify({ ...base, w: undefined })],
    ['a string frame rate', doc({ fr: '60' })],
    ['no out-point', JSON.stringify({ ...base, op: undefined })],
  ])('refuses %s', (_, text) => {
    expect(parseLottie(text)).toBeNull()
  })

  it('refuses a file over the size ceiling', () => {
    const padded = doc({ pad: 'x'.repeat(MAX_LOTTIE_BYTES) })
    expect(parseLottie(padded)).toBeNull()
  })
})

describe('image assets cannot reach the network', () => {
  it('blanks an external image asset', () => {
    /*
     * ⚠️ The player joins `u` + `p` and the browser fetches it — a tracking
     * pixel carrying every operator's IP, served from a catalog file.
     */
    const parsed = parseLottie(
      doc({
        assets: [
          { id: 'img_0', w: 10, h: 10, u: 'https://evil.example/', p: 'px.png' },
        ],
      }),
    )
    const asset = (parsed?.['assets'] as Record<string, unknown>[])[0]

    expect(asset?.['u']).toBe('')
    expect(asset?.['p']).toMatch(/^data:image\/png;base64,/)
    expect(JSON.stringify(parsed)).not.toContain('evil.example')
  })

  it('blanks an SVG data URI, which can carry script', () => {
    const parsed = parseLottie(
      doc({
        assets: [{ id: 'img_0', u: '', p: 'data:image/svg+xml;base64,PHN2Zz4=' }],
      }),
    )
    const asset = (parsed?.['assets'] as Record<string, unknown>[])[0]
    expect(asset?.['p']).not.toContain('svg')
  })

  it('keeps an embedded raster image', () => {
    const embedded = 'data:image/webp;base64,UklGRg=='
    const parsed = parseLottie(doc({ assets: [{ id: 'img_0', u: '', p: embedded }] }))
    const asset = (parsed?.['assets'] as Record<string, unknown>[])[0]
    expect(asset?.['p']).toBe(embedded)
  })

  it('leaves a precomposition untouched', () => {
    /* The only asset kind in the live catalog. */
    const precomp = { id: 'comp_0', layers: [{ ty: 4 }] }
    const parsed = parseLottie(doc({ assets: [precomp] }))
    expect(parsed?.['assets']).toEqual([precomp])
  })
})
