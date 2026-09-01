/**
 * Minimal version comparison for mobile release policies.
 *
 * This exists for exactly one reason: the backend does **not** validate that
 * `minRequiredVersion <= latestVersion` on
 * `PATCH /admin/settings/deployment/app-versions` (verified live 2026-09-01,
 * system_settings_plan.md §2.5). A policy of `latest 1.0.0` / `min 99.0.0` with
 * `forceUpdate: true` tells every mobile user to install a build that does not
 * exist, and there is no in-app way back from that.
 *
 * It is a **UX guard, not enforcement** (plan.md §3.4). The server will still
 * accept the bad pair from anything that is not this form.
 *
 * Deliberately not a semver library. The backend accepts `"2.4"`, `"v2.1.0"`
 * and anything else string-shaped, so a strict parser would reject values the
 * API is perfectly happy with and block an operator from saving a policy the
 * server would honour. This compares what it can and abstains otherwise.
 */

/** Parsed numeric release components, longest-first. */
function parts(version: string): readonly number[] | null {
  const cleaned = version.trim().replace(/^[vV]/, '')
  if (cleaned.length === 0) return null

  /*
   * Stop at the first pre-release or build separator: "2.4.0-beta.1" compares
   * as 2.4.0. Ordering pre-releases correctly is a real semver problem and
   * getting it subtly wrong here would be worse than not ranking them at all.
   */
  const core = cleaned.split(/[-+]/)[0] ?? ''
  const segments = core.split('.')

  const numbers: number[] = []
  for (const segment of segments) {
    if (!/^\d+$/.test(segment)) return null
    numbers.push(Number(segment))
  }

  return numbers.length > 0 ? numbers : null
}

/** True when `version` is shaped well enough for {@link compareVersions}. */
export function isComparableVersion(version: string): boolean {
  return parts(version) !== null
}

/**
 * `-1` if `a < b`, `0` if equal, `1` if `a > b`, and `null` when either side
 * cannot be compared numerically.
 *
 * `null` is a distinct outcome from `0` on purpose. A caller must be able to
 * tell "these are equal" from "I have no idea", because the second means the
 * guard cannot speak and must let the operator through rather than block a
 * save on a value the server would accept.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const left = parts(a)
  const right = parts(b)
  if (!left || !right) return null

  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    // Missing trailing segments are zero: 2.4 and 2.4.0 are the same release.
    const l = left[index] ?? 0
    const r = right[index] ?? 0
    if (l < r) return -1
    if (l > r) return 1
  }

  return 0
}

/**
 * Is this release policy internally coherent?
 *
 * Returns `true` when the minimum required version is at or below the latest
 * available one — and also when the two cannot be compared, because an
 * unrankable pair is not evidence of a mistake.
 */
export function isPolicyCoherent(
  latestVersion: string,
  minRequiredVersion: string,
): boolean {
  const comparison = compareVersions(minRequiredVersion, latestVersion)
  return comparison === null || comparison <= 0
}
