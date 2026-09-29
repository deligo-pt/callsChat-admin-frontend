import { AlertTriangle } from 'lucide-react'

import { PERMISSIONS } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { CopyableId, DateTime } from '@/components/display'
import { ErrorState, LoadingState } from '@/components/feedback'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/cn'
import type { BootstrapConfig, BootstrapPlatform } from '@/types/bootstrap'

import { ClientPreview } from './ClientPreview'
import { activeDangers } from './evaluate'
import { FeatureFlagsCard } from './FeatureFlagsCard'
import { LegalCard } from './LegalCard'
import { MaintenanceCard } from './MaintenanceCard'
import { ReleasePolicyCard } from './ReleasePolicyCard'
import { SessionCard } from './SessionCard'
import { useBootstrapPlatform, useBootstrapQuery } from './useBootstrap'

/**
 * Bootstrap Configuration — `/settings/bootstrap` (plan.md §5.1).
 *
 * Fully editable since B3. The three switches that can stop the product —
 * maintenance mode, force update, force logout — go through
 * `ConfirmActionDialog` on the way **on** and send immediately on the way
 * **off**: restoring service should never be harder than breaking it.
 *
 * This is the record every mobile client reads before it renders anything, and
 * two facts about it shape the whole screen:
 *
 * 1. **A save is live, globally, on the next request** — verified: a write was
 *    visible on the unauthenticated public endpoint immediately. There is no
 *    draft and no staging, so nothing here may look like one.
 * 2. **Nothing prevents two operators overwriting each other** (§3.5). The
 *    status line carrying `configVersion`, `updatedAt` and `updatedBy` is the
 *    only defence, which is why it is at the top rather than in a footer.
 */

const PLATFORM_LABEL: Readonly<Record<BootstrapPlatform, string>> = {
  ANDROID: 'Android',
  IOS: 'iOS',
}

/** Copy for the LIVE NOW banner, per switch. */
const DANGER_COPY: Readonly<Record<string, string>> = {
  maintenanceMode: 'Maintenance mode is on — every client shows a full-screen notice.',
  forceUpdate: 'Emergency force update is on — every client is blocked behind it.',
  forceLogout: 'Global force logout is on — every session is being destroyed.',
}

function PlatformSwitch({
  platform,
  platforms,
  onSelect,
}: {
  platform: BootstrapPlatform
  platforms: readonly BootstrapPlatform[]
  onSelect: (next: BootstrapPlatform) => void
}) {
  return (
    /*
     * A URL-backed segmented control, not a Radix `Tabs`.
     *
     * The platform has to deep-link, survive a reload and be pasteable
     * (§4.1), and `Tabs` owns its own state — wiring it to the URL means
     * fighting it. Two buttons and a query parameter say the same thing with
     * nothing to keep in sync.
     */
    <div
      role="group"
      aria-label="Platform"
      className="inline-flex rounded-md border border-border bg-surface-muted p-0.5"
    >
      {platforms.map((value) => {
        const selected = value === platform
        return (
          <button
            key={value}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(value)}
            className={cn(
              'touch-target rounded-sm px-4 text-body transition-colors',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              selected
                ? 'bg-surface text-foreground shadow-xs'
                : 'text-foreground-muted hover:text-foreground',
            )}
          >
            {PLATFORM_LABEL[value]}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Who changed it, when, and which revision this is.
 *
 * Not decoration. `configVersion` is the only signal that somebody else wrote
 * while this tab was open (§3.5), and `updatedBy` is a **bare id** the panel
 * must not guess a name for (§3.6).
 */
function StatusLine({ config }: { config: BootstrapConfig }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-caption text-foreground-muted">
      <span className="tabular">Revision {config.configVersion}</span>
      <span aria-hidden="true">·</span>
      <span>
        Changed <DateTime value={config.updatedAt} relative />
      </span>
      <span aria-hidden="true">·</span>
      {config.updatedBy ? (
        <span className="flex min-w-0 items-center gap-1.5">
          by <CopyableId value={config.updatedBy} />
        </span>
      ) : (
        <span>never changed from this panel</span>
      )}
    </div>
  )
}

export function BootstrapTab() {
  const { can } = useAuth()
  /*
   * Same gate as every other settings section. The API's own
   * `SYSTEM_SETTINGS_EDIT` bridges to these two panel permissions — unverified
   * (plan.md §2.6, §8 R5), because the only credential available bypasses
   * module permissions entirely.
   */
  const canEdit = can(PERMISSIONS.configurationConfigure)
  const { platform, setPlatform, platforms } = useBootstrapPlatform()
  const query = useBootstrapQuery(platform)

  if (query.isPending) return <LoadingState variant="form" />

  if (query.isError || !query.data) {
    return (
      <ErrorState
        title="Bootstrap configuration could not be loaded"
        description="The configuration your mobile clients read did not load. Nothing has been changed."
        onRetry={() => void query.refetch()}
      />
    )
  }

  const config = query.data
  const dangers = activeDangers(config)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PlatformSwitch
          platform={platform}
          platforms={platforms}
          onSelect={setPlatform}
        />
        <StatusLine config={config} />
      </div>

      {/*
       * LIVE NOW. An operator arriving during an incident should not have to
       * read five cards to learn the product is down (§5.1).
       */}
      {dangers.length > 0 ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>
            {PLATFORM_LABEL[config.platform]} clients are affected right now
          </AlertTitle>
          <AlertDescription>
            <ul className="space-y-1">
              {dangers.map((danger) => (
                <li key={danger}>{DANGER_COPY[danger]}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {/*
       * Two columns at `lg`, split by **how urgent the card is**, not by size.
       *
       * Six stacked cards made this the longest page in the panel, and the
       * cost was not scrolling — it was that the preview sat at the bottom,
       * far from the release policy it describes. An operator editing
       * `minSupportedVersion` could not see who that would force-update
       * without leaving the field.
       *
       * Left: what is affecting users right now — maintenance, the release
       * policy, sessions. Right: reference and the things that change slowly.
       * `items-start` so the columns do not stretch to match each other.
       *
       * Below `lg` it is one column in source order, which puts the urgent
       * cards first on a phone.
       */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <MaintenanceCard config={config} canEdit={canEdit} />
          <ReleasePolicyCard config={config} canEdit={canEdit} />
          <SessionCard config={config} canEdit={canEdit} />
        </div>

        <div className="min-w-0 space-y-6">
          {/*
           * First in this column on purpose: it answers a question about the
           * *other* column, so it sits level with the release policy it
           * reports on.
           *
           * ⚠️ **Not sticky.** It was, briefly, so it would stay in view while
           * the policy was edited — and it travelled down over the two cards
           * below it in its own column, hiding the feature-flag warning and
           * both of that card's buttons. A sticky element stays in flow and
           * its later siblings scroll *behind* it, so the only way to make it
           * safe would be a column with nothing beneath it. Being adjacent is
           * worth less than not covering the controls underneath.
           */}
          <ClientPreview config={config} />
          <FeatureFlagsCard config={config} canEdit={canEdit} />
          <LegalCard config={config} canEdit={canEdit} />
        </div>
      </div>
    </div>
  )
}
