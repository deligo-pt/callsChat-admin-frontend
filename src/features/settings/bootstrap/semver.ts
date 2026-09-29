/**
 * The small part of SemVer this module actually needs (plan.md §7, phase B0).
 *
 * **No new dependency.** The comparison required is major/minor/patch with an
 * optional pre-release tag, and the API's own rejection message defines the
 * accepted shape verbatim:
 *
 * > `body/minSupportedVersion Must be a valid Semantic Version (e.g. 1.0.0,
 * > 1.2.3-beta.1)`
 *
 * Two jobs, and they are separate on purpose:
 *
 * - {@link isValidSemver} decides what the panel will **send**. It has to agree
 *   with the server, or the operator gets a 400 from a field that looked fine.
 * - {@link compareSemver} decides what the panel **predicts** a client will be
 *   told (`evaluate.ts`). It has to agree with the server's ordering, or the
 *   preview lies about who gets force-updated.
 */

/** `1.2.3` or `1.2.3-beta.1`. Build metadata (`+…`) is not accepted. */
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][\dA-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][\dA-Za-z-]*))*))?$/

export interface Semver {
  readonly major: number
  readonly minor: number
  readonly patch: number
  /** The dot-separated identifiers after `-`, or `[]` for a release build. */
  readonly prerelease: readonly string[]
}

/**
 * Parse, or `null` for anything this module refuses to guess at.
 *
 * `null` rather than a thrown error or a `0.0.0` fallback: every caller has a
 * real decision to make about an unparseable version, and two of them decide
 * differently. `isValidSemver` refuses it; `evaluate.ts` **fails open** and
 * treats the client as up to date, because that is what the live server does
 * (plan.md §2.5).
 */
export function parseSemver(value: string): Semver | null {
  const match = SEMVER_PATTERN.exec(value.trim())
  if (!match) return null

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  }
}

export function isValidSemver(value: string | null | undefined): value is string {
  return typeof value === 'string' && parseSemver(value) !== null
}

/**
 * Compare two identifiers from a pre-release tag, per the SemVer spec.
 *
 * Numeric identifiers sort numerically and always below alphanumeric ones, so
 * `1.0.0-alpha.2` is below `1.0.0-alpha.beta`. This is the fiddly half of the
 * spec and the half a hand-rolled string comparison gets wrong.
 */
function compareIdentifier(a: string, b: string): number {
  const aNumeric = /^\d+$/.test(a)
  const bNumeric = /^\d+$/.test(b)

  if (aNumeric && bNumeric) return Number(a) - Number(b)
  if (aNumeric) return -1
  if (bNumeric) return 1
  return a < b ? -1 : a > b ? 1 : 0
}

function comparePrerelease(a: readonly string[], b: readonly string[]): number {
  /* A release outranks any pre-release of the same version: 1.2.3 > 1.2.3-rc.1. */
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1
  if (b.length === 0) return -1

  const shared = Math.min(a.length, b.length)
  for (let index = 0; index < shared; index += 1) {
    const result = compareIdentifier(a[index]!, b[index]!)
    if (result !== 0) return result
  }

  /* A longer tag outranks its own prefix: 1.0.0-alpha.1 > 1.0.0-alpha. */
  return a.length - b.length
}

/**
 * `-1` if `a` is below `b`, `1` if above, `0` if equal.
 *
 * ⚠️ Returns `null` when **either** side is unparseable, so a caller has to
 * decide what an unknown version means rather than being handed a silent `0`
 * that reads as "equal".
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 | null {
  const left = parseSemver(a)
  const right = parseSemver(b)
  if (!left || !right) return null

  /*
   * Field by field, numerically. A string comparison would put `1.10.0` below
   * `1.2.0` — which, on this screen, is the difference between force-updating
   * everyone on the newest build and force-updating nobody.
   */
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1
  }

  const prerelease = comparePrerelease(left.prerelease, right.prerelease)
  return prerelease < 0 ? -1 : prerelease > 0 ? 1 : 0
}

/** `a < b`, and `false` when either side is unparseable — never a guess. */
export function isBelow(a: string, b: string): boolean {
  return compareSemver(a, b) === -1
}
