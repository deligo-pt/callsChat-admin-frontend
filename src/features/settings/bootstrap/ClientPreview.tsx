import { useState } from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/cn'
import { TONE_CLASSES } from '@/lib/status'
import type { BootstrapConfig } from '@/types/bootstrap'

import { evaluateClient, type ClientOutcome } from './evaluate'

/**
 * What a client on a given version would be told (plan.md §5.6).
 *
 * ⚠️ **Calculated here, not asked of the server**, and the card says so in
 * plain words. The obvious design — ask the public endpoint what a phone on
 * 1.2.0 receives — is unreachable: CORS preflight on `GET /bootstrap` allows
 * only `Content-Type, Authorization, X-Request-ID, x-workspace-id`, so a
 * browser cannot send `app-version` and the server would evaluate against no
 * client at all (§3.8).
 *
 * A preview that quietly claimed to be the server's own answer would be the
 * worse design: it would be believed during exactly the incident where being
 * wrong costs the most.
 *
 * It earns its place anyway. An operator can see that `minSupportedVersion:
 * 2.0.0` force-updates the version they are running **before** saving it —
 * and on this endpoint a save is live, globally, on the next request.
 */

/** Why the outcome is what it is, and which field would change it. */
const REASON_COPY: Readonly<Record<ClientOutcome['reason'], string>> = {
  'force-update-switch': 'Emergency force update is on, so every client is blocked.',
  'blocked-version': 'This exact version is in the blocked list.',
  'below-min-version': 'This version is below the minimum supported version.',
  'below-min-build': 'This build number is below the minimum build number.',
  'behind-latest-version': 'A newer version has been released.',
  'behind-latest-build': 'A newer build of this version has been released.',
  'up-to-date': 'This client is current — nothing is asked of it.',
}

const STATUS_COPY = {
  forced: {
    label: 'Forced update',
    tone: TONE_CLASSES.danger,
    effect: 'The app shows an update wall that cannot be dismissed.',
  },
  optional: {
    label: 'Optional update',
    tone: TONE_CLASSES.warning,
    effect: 'The app offers an update, and the user may decline it.',
  },
  none: {
    label: 'No update',
    tone: TONE_CLASSES.success,
    effect: 'The app starts normally.',
  },
} as const

export function ClientPreview({ config }: { config: BootstrapConfig }) {
  /*
   * Seeded from the config's own latest release, so the card opens on the
   * answer for a fully updated client — the baseline an operator compares
   * against — rather than on an empty form.
   */
  const [version, setVersion] = useState(config.latestVersion)
  const [buildNumber, setBuildNumber] = useState(String(config.latestBuildNumber))

  const parsedBuild = Number.parseInt(buildNumber, 10)
  const outcome = evaluateClient(config, {
    version,
    /* A blank or unparseable build is treated as 0 — the oldest possible. */
    buildNumber: Number.isFinite(parsedBuild) ? parsedBuild : 0,
  })
  const status = STATUS_COPY[outcome.status]

  return (
    /*
     * A plain `Card`, not a `SettingsCard`.
     *
     * `SettingsCard` always renders a record footer — "Updated … by …", or
     * "Not changed since this environment was set up" when it has no
     * timestamp. This card is a calculator, not a record: it has no
     * provenance, nothing to save, and that footer read as a claim about data
     * that does not exist.
     */
    <Card>
      <CardHeader>
        <CardTitle>What a client would see</CardTitle>
        <CardDescription>
          Try a version and build number against the settings on the left. Nothing is
          sent and nothing is saved.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="preview-version">App version</Label>
            <Input
              id="preview-version"
              value={version}
              onChange={(event) => setVersion(event.target.value)}
              placeholder="1.2.0"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="preview-build">Build number</Label>
            <Input
              id="preview-build"
              type="number"
              inputMode="numeric"
              value={buildNumber}
              onChange={(event) => setBuildNumber(event.target.value)}
              placeholder="12"
              className="font-mono"
            />
          </div>
        </div>

        <div
          className="space-y-2 rounded-md border border-border bg-surface-muted p-3"
          /* Announced as it changes — the whole point is watching it move. */
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center rounded-sm px-2 py-1 text-overline uppercase',
                status.tone,
              )}
            >
              {status.label}
            </span>
            {outcome.forceLogout ? (
              <span
                className={cn(
                  'inline-flex items-center rounded-sm px-2 py-1 text-overline uppercase',
                  TONE_CLASSES.danger,
                )}
              >
                Signed out
              </span>
            ) : null}
          </div>

          <p className="text-body">{status.effect}</p>
          {/*
           * The rung that decided it. Six rungs can produce three statuses,
           * and two of them are fixed in different fields — an operator told
           * "forced" with no reason has to guess which input to edit.
           */}
          <p className="text-caption text-foreground-muted">
            {REASON_COPY[outcome.reason]}
            {outcome.forceLogout
              ? ' This client is also signed out and must sign in again.'
              : ''}
          </p>
        </div>

        {/*
         * Not a footnote. This is the line that stops the card being believed
         * as the server's own answer.
         */}
        <p className="text-caption text-foreground-subtle">
          Calculated by this panel from the settings above. Not a live response from the
          server.
        </p>
      </CardContent>
    </Card>
  )
}
