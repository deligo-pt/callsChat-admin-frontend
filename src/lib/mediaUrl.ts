import { env } from '@/env'

import { safeHttpsUrl } from './safeUrl'

/**
 * Catalog asset URLs, resolved — not trusted.
 *
 * ⚠️ **This exists because the backend returns two different URL shapes for
 * the same kind of asset** (plan.md §2.4, O10), measured 2026-10-28:
 *
 *   - stored records are **root-relative**:
 *     `/api/v1/media/download/catalog/gifts/teddy_bear.json`
 *   - `POST /admin/catalog/upload-url` returns **absolute**:
 *     `https://media.callschat.com/calls-chat-media/catalog/gifts/...png`
 *
 * ⚠️ **`lib/safeUrl.ts` refuses a relative URL on purpose, and that stays
 * true.** Resolving one against the panel's own origin is how `/admin/settings`
 * became a plausible "attachment" in the feedback module — a link that looked
 * like content and was actually this app. So the fix is to resolve catalog
 * paths **explicitly, against a base we control**, never to loosen the guard.
 *
 * The two cases are therefore handled separately and on purpose:
 *
 *   1. a path beginning `/` is joined to {@link API_URL} — our own API, the
 *      only origin a relative catalog path can legitimately mean;
 *   2. anything else must survive `safeHttpsUrl` unchanged.
 *
 * Everything else — `javascript:`, `data:`, a protocol-relative `//evil.com`,
 * a bare `evil.com` — returns `null`.
 */

/**
 * ⚠️ `//host/path` is NOT a path, although it starts with a slash: the URL
 * parser reads it as protocol-relative and resolves it against *any* origin.
 * Checked before the leading-slash branch, or `//evil.com/x.json` would be
 * joined to our API base and quietly produce `https://evil.com/x.json`.
 */
function isProtocolRelative(value: string): boolean {
  return value.startsWith('//')
}

/**
 * The URL a browser may fetch for a catalog asset, or `null` when the value
 * must not be used.
 *
 * ⚠️ `null` is not an error to swallow. Callers render the raw value as inert
 * text with a visible warning, exactly as the intro-media and receipt fields
 * do — dropping the row would hide a bad asset from the only people able to
 * fix it.
 */
export function catalogAssetUrl(value: string | null | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null

  if (isProtocolRelative(raw)) return null

  if (raw.startsWith('/')) {
    /*
     * ⚠️ **The ORIGIN, not `API_URL`.** `API_URL` already ends in `/api/v1`
     * and every stored catalog path already begins with it — joining the two
     * produces `/api/v1/api/v1/media/...`, which the server answers `404`.
     * Verified both ways against the live backend on 2026-10-28; the doubled
     * form is a plausible-looking URL that silently renders nothing.
     *
     * Re-checked through `safeHttpsUrl` afterwards rather than trusted for
     * where it came from: the base is `https:` in every deployed mode, and in
     * local development against `http://localhost` this correctly returns
     * `null` and the caller shows its warning. That is the honest outcome,
     * not a reason to special-case localhost.
     */
    return safeHttpsUrl(`${env.VITE_API_BASE_URL.replace(/\/$/, '')}${raw}`)
  }

  return safeHttpsUrl(raw)
}

/**
 * Is this asset a Lottie animation rather than a still image?
 *
 * ⚠️ **Every gift in the live catalog is Lottie, and `iconUrl` is the same
 * `.json` file as `animationUrl`** (plan.md §2.4). There is no static
 * thumbnail anywhere, so a list cannot use `<img>` — it has to know which
 * renderer to reach for, per asset, before it paints.
 *
 * Decided on the path's extension, because the catalog carries no MIME field.
 * `animationType` exists on a gift but not on an emoji or a pack cover, so it
 * cannot be the shared signal.
 */
export function isLottieAsset(value: string | null | undefined): boolean {
  const raw = value?.trim()
  if (!raw) return false

  /* Query strings are real: a pre-signed URL carries `?X-Amz-...`. */
  const path = raw.split('?')[0] ?? ''
  return path.toLowerCase().endsWith('.json')
}

/**
 * Is this asset a video? `MP4` is one of the three gift animation types the
 * server accepts (measured, G3), and a video cannot be drawn with `<img>`.
 */
export function isVideoAsset(value: string | null | undefined): boolean {
  const raw = value?.trim()
  if (!raw) return false
  const path = raw.split('?')[0] ?? ''
  return path.toLowerCase().endsWith('.mp4')
}
