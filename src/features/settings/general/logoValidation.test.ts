import { describe, expect, it } from 'vitest'

import { formatBytes, validateLogoFile } from './logoValidation'

/**
 * Logo validation.
 *
 * The server checks the declared MIME type and nothing else — an 8-byte file
 * carrying only a PNG magic header was accepted and permanently stored during
 * contract testing. `logoUrl` cannot then be cleared, so these checks are the
 * last point at which a broken logo is still preventable.
 */

function file(name: string, type: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

describe('validateLogoFile', () => {
  it('rejects a file type the API does not accept', async () => {
    const result = await validateLogoFile(file('notes.txt', 'text/plain', 100))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('type')
  })

  it('rejects a PDF renamed to look like an image', async () => {
    // The extension is a lie; the declared type is what both sides read.
    const result = await validateLogoFile(file('logo.png', 'application/pdf', 100))

    expect(result.ok).toBe(false)
  })

  it('rejects a file over 5 MB, naming the actual size', async () => {
    const result = await validateLogoFile(file('big.png', 'image/png', 6 * 1024 * 1024))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('size')
      expect(result.error.message).toContain('6.0 MB')
    }
  })

  it('rejects an empty file', async () => {
    const result = await validateLogoFile(file('empty.png', 'image/png', 0))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe('decode')
  })

  it('accepts an SVG without trying to decode it', async () => {
    /*
     * `createImageBitmap` cannot read SVG. Refusing every SVG because our own
     * check cannot handle it would block a format the API accepts.
     */
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'logo.svg', {
      type: 'image/svg+xml',
    })

    const result = await validateLogoFile(svg)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.info).toBeNull()
  })

  it('accepts every documented raster type by declared MIME', async () => {
    for (const type of [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/avif',
    ]) {
      const result = await validateLogoFile(file('logo', type, 1024))
      // In this environment `createImageBitmap` is absent, so the decode step
      // abstains rather than blocking — see the note in logoValidation.ts.
      expect(result.ok).toBe(true)
    }
  })
})

describe('formatBytes', () => {
  it('scales the unit to the size', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})
