import { LOGO_ACCEPTED_TYPES, LOGO_MAX_BYTES } from '@/types/settings'

/**
 * Client-side logo checks.
 *
 * The server validates the **declared** MIME type only. An 8-byte file
 * containing nothing but a PNG magic header was accepted and stored during
 * contract testing, and `logoUrl` cannot be cleared afterwards
 * (system_settings_plan.md §2.6 / §3.5) — so a bad upload is permanent until
 * someone uploads a good one.
 *
 * That asymmetry is why these checks are worth doing properly here: this is
 * the last point at which a broken image is still preventable.
 */

export type LogoRejection =
  | { readonly kind: 'type'; readonly message: string }
  | { readonly kind: 'size'; readonly message: string }
  | { readonly kind: 'decode'; readonly message: string }

export interface LogoAccepted {
  readonly width: number
  readonly height: number
}

const ACCEPTED = new Set<string>(LOGO_ACCEPTED_TYPES)

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Validate a chosen file, decoding it to prove it is a real image.
 *
 * SVG is exempt from the decode step: it is a valid logo format the API
 * accepts, but `createImageBitmap` does not handle it, and refusing every SVG
 * because our check cannot read it would block a legitimate upload. Its type
 * and size are still checked.
 */
export async function validateLogoFile(
  file: File,
): Promise<
  { ok: true; info: LogoAccepted | null } | { ok: false; error: LogoRejection }
> {
  if (!ACCEPTED.has(file.type)) {
    return {
      ok: false,
      error: {
        kind: 'type',
        message:
          'That file type is not supported. Use PNG, JPG, GIF, WebP, SVG, ICO, BMP or AVIF.',
      },
    }
  }

  if (file.size > LOGO_MAX_BYTES) {
    return {
      ok: false,
      error: {
        kind: 'size',
        message: `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(LOGO_MAX_BYTES)}.`,
      },
    }
  }

  if (file.size === 0) {
    return {
      ok: false,
      error: { kind: 'decode', message: 'That file is empty.' },
    }
  }

  if (file.type === 'image/svg+xml') return { ok: true, info: null }

  /*
   * Not available in every environment (older Safari, some test runners).
   * Missing the decode check is not a reason to block an otherwise valid
   * upload — the type and size checks above still stand.
   */
  if (typeof createImageBitmap !== 'function') return { ok: true, info: null }

  try {
    const bitmap = await createImageBitmap(file)
    const info = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return { ok: true, info }
  } catch {
    return {
      ok: false,
      error: {
        kind: 'decode',
        message: 'That file is not a readable image. It may be truncated or misnamed.',
      },
    }
  }
}
