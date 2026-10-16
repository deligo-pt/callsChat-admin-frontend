/**
 * The one place a stranger's string becomes something the browser will act on.
 *
 * ⚠️ **This backend validates no URL field anywhere.** Three separate routes
 * were probed and all three stored and served `javascript:` verbatim:
 *
 * - `feedback_attachments.fileUrl` — submitted from an ordinary user account,
 *   `201 Created`, returned unchanged to the admin panel (2026-09-06);
 * - `bootstrap.storeUrl` / `privacyPolicyUrl` / `termsUrl` — `200 OK`, then
 *   served from the **unauthenticated** public endpoint (2026-09-28);
 * - `hostApplication.introMediaUrl` — same shape, same absence of validation
 *   (2026-10-15).
 *
 * ⚠️ **Extracted here on 2026-10-15, at the third copy.** `features/feedback`
 * and `features/settings/bootstrap` each grew their own, and the second one
 * argued the duplication was right because "merging them would couple two
 * unrelated modules through a file neither owns". That held at two. At three it
 * stops holding: `eslint.config.js` forbids features from importing each other
 * precisely so shared logic lands in `lib/`, and a security check that exists in
 * three places is a security check that gets fixed in one of them.
 *
 * The module-level wrappers stay — they carry each contract's own constant and
 * its own evidence — but the parse lives here.
 *
 * Built on `new URL()` rather than a regex, deliberately: the URL parser is the
 * same one the browser will use, so there is no gap between what this judges
 * and what the browser would do. A regex would have to anticipate
 * `java\nscript:`, `JavaScript:`, leading control characters and every other
 * normalisation the parser already performs.
 */

/**
 * Schemes the panel will act on. `https:` and nothing else:
 *
 * - `javascript:` — observed live on three routes. Executes.
 * - `data:` — `data:text/html,…` is same-origin-ish in enough browsers to
 *   refuse outright, and nothing legitimate arrives inlined.
 * - `blob:` — can only refer to something this document created, so arriving
 *   from a server it means a client leaked a local handle.
 * - `http:` — an https admin session fetching plaintext is a downgrade.
 * - `file:`, `ftp:`, custom app schemes — nothing serves content over them.
 */
export const ALLOWED_URL_PROTOCOL = 'https:'

/**
 * The normalised `https:` URL, or `null` when the value must not be used.
 *
 * ⚠️ `null` is not an error to swallow. Every caller renders the raw value as
 * inert text with a visible warning instead — dropping the row would hide an
 * attack from the only people able to act on it.
 *
 * Returns `parsed.href`, not the input: the parser has normalised escapes and
 * whitespace, so what comes back is exactly what the browser would use.
 * Returning the original would let the two disagree.
 */
export function safeHttpsUrl(value: string): string | null {
  let parsed: URL

  try {
    parsed = new URL(value)
  } catch {
    /*
     * Unparseable — and relative URLs land here too, refused on purpose.
     * Resolving one against the panel's own origin would point an operator at
     * this app rather than at the content, which is how `/admin/settings`
     * became a plausible "attachment" in the feedback module.
     */
    return null
  }

  if (parsed.protocol !== ALLOWED_URL_PROTOCOL) return null

  return parsed.href
}
