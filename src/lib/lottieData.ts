/**
 * Lottie documents, checked before a player ever sees them (plan.md §2.4,
 * phase G2).
 *
 * ⚠️ **A Lottie file is not an image; it is a program description.** The
 * player follows what the document says, and two things it can say matter to
 * an admin panel:
 *
 *   1. **Image assets can point anywhere.** An asset's `u` + `p` is joined into
 *      a URL and fetched by the browser, so a catalog file uploaded by anyone
 *      with `gifts.configure` could make every operator who opens this screen
 *      request a third-party URL — a tracking pixel with an admin's IP on it.
 *      Embedded `data:image/*` assets are kept; every other one is blanked.
 *   2. **Expressions are JavaScript.** The full `lottie-web` build evaluates
 *      them with `eval`. The panel loads `lottie_light`, which has no
 *      expression engine at all, so they are inert — this module does not
 *      have to strip them, and does not pretend to.
 *
 * ⚠️ **The size cap is a ceiling, not a measurement of normal.** The live
 * catalog files run 15–193 KB (all 8 measured 2026-10-28, all parsed by this
 * module, none using expressions). Ten times the largest is not a gift
 * animation an operator needs to see in a grid.
 */

/** 2 MB. The largest live file is 193 KB. */
export const MAX_LOTTIE_BYTES = 2 * 1024 * 1024

/** 1×1 transparent PNG — what a refused external image asset becomes. */
const BLANK_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

const EMBEDDED_IMAGE = /^data:image\/(png|jpe?g|webp|gif);base64,/i

export type LottieDocument = Record<string, unknown> & {
  readonly layers: readonly unknown[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * An image asset is one with a `p` (path) and no `layers` — a precomposition
 * carries `layers` and fetches nothing.
 */
function defuseAsset(asset: unknown): unknown {
  if (!isRecord(asset) || Array.isArray(asset['layers'])) return asset
  const path = asset['p']
  if (typeof path !== 'string') return asset

  if (EMBEDDED_IMAGE.test(path)) return { ...asset, u: '', e: 1 }
  return { ...asset, u: '', p: BLANK_IMAGE, e: 1 }
}

/**
 * Parse and defuse a Lottie document, or `null` when the text is not one.
 *
 * ⚠️ `null` is the caller's cue to show "Preview unavailable", not to retry
 * with a different renderer. A `.json` file that is not a Lottie document is a
 * catalog defect an operator should see.
 */
export function parseLottie(text: string): LottieDocument | null {
  if (text.length > MAX_LOTTIE_BYTES) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }

  if (!isRecord(parsed)) return null
  const layers = parsed['layers']
  if (!Array.isArray(layers)) return null
  for (const key of ['w', 'h', 'fr', 'op'] as const) {
    if (typeof parsed[key] !== 'number' || !Number.isFinite(parsed[key])) return null
  }

  const assets = parsed['assets']
  return {
    ...parsed,
    layers,
    ...(Array.isArray(assets) ? { assets: assets.map(defuseAsset) } : {}),
  }
}
