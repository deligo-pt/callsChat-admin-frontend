import type { BootstrapConfig, UpdateStatus } from '@/types/bootstrap'

import { isBelow } from './semver'

/**
 * What a client on a given version would be told (plan.md §2.5, §3.8).
 *
 * ⚠️ **This is a local calculation, not the server's answer**, and every
 * surface that renders it has to say so. The obvious design — ask the public
 * endpoint what a phone on 1.2.0 gets — is unreachable: CORS preflight on
 * `GET /bootstrap` allows only `Content-Type, Authorization, X-Request-ID,
 * x-workspace-id`, so a browser cannot send `app-version` or `build-number`
 * and the server would evaluate against no client at all.
 *
 * The ladder below was confirmed against the live service on 2026-09-28 for
 * every rung reachable without taking production down. The two that were not —
 * `forceUpdate` and `maintenanceMode` — are asserted through the mock, and
 * plan.md B3 requires them verified outside production before that phase ships.
 *
 * Order is load-bearing: the first rung that matches wins, and `forced` must
 * never be downgraded to `optional` by a later check.
 */

export interface ClientDescriptor {
  /** What the app reports as its version. May be absent or nonsense. */
  readonly version: string
  /** `versionCode` on Android, `CFBundleVersion` on iOS. */
  readonly buildNumber: number
}

export interface ClientOutcome {
  readonly status: UpdateStatus
  readonly forceLogout: boolean
  /**
   * Which rung decided it, for the UI to explain *why* — an operator seeing
   * "forced" needs to know whether it was the blocklist or the floor, because
   * those are fixed in different fields.
   */
  readonly reason:
    | 'force-update-switch'
    | 'blocked-version'
    | 'below-min-version'
    | 'below-min-build'
    | 'behind-latest-version'
    | 'behind-latest-build'
    | 'up-to-date'
}

/**
 * ⚠️ **Fails open on an unparseable version**, because the live server does.
 *
 * `app-version: not-a-version` was answered with `status: "none"` — no 400, no
 * forced update. So a malformed policy cannot lock anyone out, but the panel
 * also cannot lean on the server to reject nonsense: the form has to validate
 * before sending (plan.md §3.4).
 */
export function evaluateClient(
  config: BootstrapConfig,
  client: ClientDescriptor,
): ClientOutcome {
  const forceLogout = evaluateForceLogout(config, client)
  const outcome = (
    status: UpdateStatus,
    reason: ClientOutcome['reason'],
  ): ClientOutcome => ({ status, forceLogout, reason })

  /* 1 — the emergency switch outranks every version comparison. */
  if (config.forceUpdate) return outcome('forced', 'force-update-switch')

  /*
   * 2 — an exact string match against the blocklist.
   *
   * Deliberately NOT a SemVer comparison: the server stores whatever was sent,
   * including entries that are not versions at all (plan.md §3.4), and an
   * entry only ever blocks a client reporting that exact string.
   */
  if (config.blockedVersions.includes(client.version)) {
    return outcome('forced', 'blocked-version')
  }

  /* 3 — below the supported floor. */
  if (isBelow(client.version, config.minSupportedVersion)) {
    return outcome('forced', 'below-min-version')
  }

  /* 4 — below the build floor. Build numbers are integers, not versions. */
  if (client.buildNumber < config.minBuildNumber) {
    return outcome('forced', 'below-min-build')
  }

  /* 5 — behind the newest release, but still supported. */
  if (isBelow(client.version, config.latestVersion)) {
    return outcome('optional', 'behind-latest-version')
  }

  /* 6 — same version, older build. */
  if (client.buildNumber < config.latestBuildNumber) {
    return outcome('optional', 'behind-latest-build')
  }

  /*
   * 7 — up to date. Verified: a client *ahead* of `latestVersion` lands here
   * too, which matters for anyone running an internal build.
   */
  return outcome('none', 'up-to-date')
}

/**
 * `force_logout` is its own axis, not a rung of the update ladder.
 *
 * Verified live: a client below `forceLogoutBeforeVersion` was told
 * `force_logout: true` **and** `status: "forced"` at the same time. Folding it
 * into the ladder would have hidden one behind the other.
 */
export function evaluateForceLogout(
  config: BootstrapConfig,
  client: ClientDescriptor,
): boolean {
  if (config.forceLogout) return true
  if (!config.forceLogoutBeforeVersion) return false
  return isBelow(client.version, config.forceLogoutBeforeVersion)
}

/**
 * Whether anything about this config currently stops the product.
 *
 * Drives the LIVE NOW banner (plan.md §5.1): an operator arriving during an
 * incident should not have to read six cards to learn the product is down.
 */
export function activeDangers(config: BootstrapConfig): readonly string[] {
  const active: string[] = []
  if (config.maintenanceMode) active.push('maintenanceMode')
  if (config.forceUpdate) active.push('forceUpdate')
  if (config.forceLogout) active.push('forceLogout')
  return active
}
