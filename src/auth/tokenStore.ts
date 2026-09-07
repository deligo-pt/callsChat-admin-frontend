/**
 * Credential storage.
 *
 * plan.md §10.1: the backend authenticates with `Authorization: Bearer` and
 * issues no cookie, so the tokens have to live in the browser. That is a
 * deliberate, documented tradeoff and NOT the design this project would have
 * chosen — `doc/Admin Panel Frontend — Technical Stack & Integration Notes.md:95`
 * recommends an `HttpOnly` cookie, which would keep the credential out of
 * script reach entirely. 3A′ #6 tracks getting that decision confirmed.
 *
 * Given that constraint, the containment measures are:
 *
 *   - this module is the ONLY place credentials are read or written, so there
 *     is one audit point rather than values scattered through features;
 *   - nothing here is ever logged, put in a URL, or sent anywhere but the
 *     configured API origin;
 *   - `sessionStorage` is preferred over `localStorage` so the credential dies
 *     with the tab rather than persisting on a shared machine. A 7-day token
 *     surviving in `localStorage` on an operations workstation is a materially
 *     larger blast radius for the same convenience.
 */

const STORAGE_KEY = 'callschat.admin.session'

export interface StoredSession {
  readonly accessToken: string
  readonly refreshToken: string | null
  /** Epoch milliseconds. `null` when the server gave no usable expiry. */
  readonly expiresAt: number | null
}

type SessionListener = (session: StoredSession | null) => void

const listeners = new Set<SessionListener>()

/**
 * In-memory mirror. Storage can throw (Safari private mode, disabled site
 * data), and an admin panel that cannot authenticate because a storage quota
 * failed would be a poor failure mode — so memory is the source of truth for
 * the current tab and storage is best-effort persistence.
 */
let cached: StoredSession | null = null
let loaded = false

function safeRead(): StoredSession | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as StoredSession).accessToken === 'string'
    ) {
      return parsed as StoredSession
    }
    return null
  } catch {
    return null
  }
}

function safeWrite(session: StoredSession | null): void {
  try {
    if (session)
      globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(session))
    else globalThis.sessionStorage?.removeItem(STORAGE_KEY)
  } catch {
    /* Memory-only for this tab: the session works, it just won't survive a reload. */
  }
}

function read(): StoredSession | null {
  if (!loaded) {
    cached = safeRead()
    loaded = true
  }
  return cached
}

export function getSession(): StoredSession | null {
  return read()
}

/**
 * The access token, or `null` if there is none **or it has already expired**.
 *
 * Treating a known-expired token as absent is what stops the client presenting
 * a credential the server is guaranteed to reject, which would otherwise turn
 * every page load into a round-trip that 401s before redirecting.
 */
export function getAccessToken(): string | null {
  const session = read()
  if (!session) return null
  if (isExpired(session)) return null
  return session.accessToken
}

export function getRefreshToken(): string | null {
  return read()?.refreshToken ?? null
}

export function isExpired(session: StoredSession | null = read()): boolean {
  if (!session?.expiresAt) return false
  return Date.now() >= session.expiresAt
}

export function setSession(session: StoredSession | null): void {
  cached = session
  loaded = true
  safeWrite(session)
  for (const listener of listeners) listener(session)
}

export function clearSession(): void {
  setSession(null)
}

export function onSessionChange(listener: SessionListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Turn the API's `expiresIn` into an absolute deadline.
 *
 * The server sends a duration string such as `"7d"`. It is parsed rather than
 * assumed, and an unparseable value yields `null` — meaning "no known expiry",
 * which degrades to the previous behaviour of trusting the server's 401
 * instead of guessing wrong in either direction.
 */
export function parseExpiresIn(expiresIn: string | undefined): number | null {
  if (!expiresIn) return null

  const match = /^(\d+)\s*(ms|s|m|h|d)?$/i.exec(expiresIn.trim())
  if (!match?.[1]) return null

  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) return null

  const unit = (match[2] ?? 's').toLowerCase()
  const multiplier =
    unit === 'ms'
      ? 1
      : unit === 's'
        ? 1000
        : unit === 'm'
          ? 60_000
          : unit === 'h'
            ? 3_600_000
            : 86_400_000

  return Date.now() + value * multiplier
}

/** Test seam — resets both the mirror and the persisted value. */
export function resetSessionForTests(): void {
  cached = null
  loaded = false
  safeWrite(null)
}
