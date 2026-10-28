import { parseLottie } from './lottieData'

/**
 * Reading a catalog file before it is uploaded (plan.md §2.8; phases G3–G4).
 *
 * Shared by the gift, emoji and pack editors, which all upload through the
 * same `POST /admin/catalog/upload-url` and differ only in folder.
 */

const EXTENSION_TYPES: Readonly<Record<string, string>> = {
  json: 'application/json',
  webp: 'image/webp',
  mp4: 'video/mp4',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
}

/**
 * ⚠️ **`file.type` can be empty** — browsers derive it from the OS, and a
 * `.json` file on some systems arrives typeless. The extension is the
 * fallback, and the resolved type is what both the `upload-url` request and
 * the storage PUT must carry.
 */
export function resolveMime(file: File): string {
  if (file.type) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_TYPES[extension] ?? ''
}

/**
 * `FileReader`, not `Blob.text()` — the latter is missing from jsdom and from
 * Safari before 14, and this check is the one thing between an operator and
 * a broken upload.
 */
export function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () =>
      reject(reader.error ?? new Error('The file could not be read.'))
    reader.readAsText(file)
  })
}

/**
 * ⚠️ **A Lottie file is checked before it is uploaded**, with the same parser
 * the thumbnails use. A `.json` that is not an animation would otherwise
 * upload, save, and appear in the catalog as "Preview unavailable" — and in
 * the apps as nothing at all.
 */
export async function isLottieFile(file: File): Promise<boolean> {
  return parseLottie(await readText(file)) !== null
}

/** A human-readable display name from a file name: `heart_eyes.json` → `Heart Eyes`. */
export function nameFromFile(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '')
  return base
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}
