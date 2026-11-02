/**
 * `.lottie` (dotLottie) → plain Lottie JSON, in the browser.
 *
 * The upload service takes Lottie only as `application/json` (measured
 * 2026-11-02: `emojis` allows PNG, WebP and JSON). A `.lottie` file is a ZIP
 * holding a `manifest.json` and one or more animations, so the panel unzips it
 * and uploads the animation inside. Nothing about the server changes.
 *
 * Layouts handled:
 * - dotLottie v1: `animations/<id>.json`, images in `images/`
 * - dotLottie v2: `a/<id>.json`, images in `i/`
 *
 * Images the animation references from the archive are inlined as data URIs,
 * so the JSON plays on its own once it leaves the ZIP. Only single-animation
 * files are accepted: an emoji is one animation.
 *
 * `fflate` (≈8 kB) is loaded only when a `.lottie` file is picked.
 */

export type UnpackResult =
  | { readonly ok: true; readonly file: File }
  | { readonly ok: false; readonly message: string }

/** Refuse archives that inflate past this, so a hostile ZIP can't hang the tab. */
const MAX_UNPACKED_BYTES = 20 * 1024 * 1024

const IMAGE_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
}

export function isDotLottie(file: File): boolean {
  return /\.lottie$/i.test(file.name)
}

function readBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      resolve(
        reader.result instanceof ArrayBuffer
          ? new Uint8Array(reader.result)
          : new Uint8Array(),
      )
    reader.onerror = () =>
      reject(reader.error ?? new Error('The file could not be read.'))
    reader.readAsArrayBuffer(file)
  })
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function animationIds(manifest: unknown): string[] {
  if (!manifest || typeof manifest !== 'object') return []
  const list = (manifest as { animations?: unknown }).animations
  if (!Array.isArray(list)) return []
  return list.flatMap((entry) =>
    entry &&
    typeof entry === 'object' &&
    typeof (entry as { id?: unknown }).id === 'string'
      ? [(entry as { id: string }).id]
      : [],
  )
}

/** Inline every archive image the animation points at. Mutates `animation`. */
function inlineImages(
  animation: { assets?: unknown },
  files: Readonly<Record<string, Uint8Array>>,
): void {
  if (!Array.isArray(animation.assets)) return
  for (const asset of animation.assets as Record<string, unknown>[]) {
    const p = asset['p']
    if (typeof p !== 'string' || p.startsWith('data:') || asset['e'] === 1) continue
    const u = typeof asset['u'] === 'string' ? asset['u'] : ''
    const name = p.split('/').pop() ?? p
    const bytes =
      files[`${u}${p}`.replace(/^\/+/, '')] ??
      files[`i/${name}`] ??
      files[`images/${name}`]
    if (!bytes) continue
    const type = IMAGE_TYPES[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'image/png'
    asset['u'] = ''
    asset['p'] = `data:${type};base64,${toBase64(bytes)}`
    asset['e'] = 1
  }
}

export async function unpackDotLottie(file: File): Promise<UnpackResult> {
  const fail = (why: string): UnpackResult => ({
    ok: false,
    message: `“${file.name}” could not be opened as a .lottie animation: ${why}`,
  })

  let files: Record<string, Uint8Array>
  try {
    const [{ unzipSync }, bytes] = await Promise.all([
      import('fflate'),
      readBytes(file),
    ])
    let total = 0
    let tooBig = false
    files = unzipSync(bytes, {
      filter: (entry) => {
        total += entry.originalSize
        if (total > MAX_UNPACKED_BYTES) tooBig = true
        return !tooBig
      },
    })
    if (tooBig) return fail('it unpacks to more than 20 MB.')
  } catch {
    return fail('it is not a valid archive.')
  }

  const decoder = new TextDecoder()
  let manifest: unknown = null
  const manifestBytes = files['manifest.json']
  if (manifestBytes) {
    try {
      manifest = JSON.parse(decoder.decode(manifestBytes))
    } catch {
      manifest = null
    }
  }

  const inArchive = Object.keys(files).filter((path) =>
    /^(a|animations)\/[^/]+\.json$/.test(path),
  )
  const ids = animationIds(manifest)
  if (ids.length > 1 || inArchive.length > 1) {
    return fail('it holds more than one animation. Export each emoji on its own.')
  }
  const path =
    ids[0] !== undefined
      ? [`a/${ids[0]}.json`, `animations/${ids[0]}.json`].find((p) => p in files)
      : inArchive[0]
  const animationBytes = path ? files[path] : undefined
  if (!animationBytes) return fail('no animation was found inside.')

  let animation: { assets?: unknown }
  try {
    animation = JSON.parse(decoder.decode(animationBytes)) as { assets?: unknown }
  } catch {
    return fail('the animation inside is not valid JSON.')
  }
  inlineImages(animation, files)

  const base = file.name.replace(/\.lottie$/i, '')
  return {
    ok: true,
    file: new File([JSON.stringify(animation)], `${base}.json`, {
      type: 'application/json',
      lastModified: file.lastModified,
    }),
  }
}
