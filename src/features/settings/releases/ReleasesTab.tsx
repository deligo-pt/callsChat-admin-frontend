import { PERMISSIONS } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { CopyableId, DateTime } from '@/components/display'
import { ErrorState, LoadingState } from '@/components/feedback'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/cn'

import { formatUptime } from './formatUptime'

import { useDeploymentQuery } from '../useSettings'
import { ReachNotice } from '../ReachNotice'
import { VersionPolicyForm } from './VersionPolicyForm'

/**
 * Backend build information and the two mobile release policies.
 *
 * The runtime strip at the top is read-only and exists to answer one question
 * before an operator changes a version policy: *which build am I actually
 * looking at?* Editing a release policy against the wrong environment is the
 * mistake this page is shaped to prevent.
 */

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: React.ReactNode
  tone?: 'default' | 'danger'
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-overline text-foreground-muted">{label}</p>
      <p
        className={cn(
          'truncate text-h4',
          tone === 'danger' && 'text-danger-foreground',
        )}
      >
        {value}
      </p>
    </div>
  )
}

export function ReleasesTab() {
  const { can } = useAuth()
  const canEdit = can(PERMISSIONS.configurationConfigure)
  const query = useDeploymentQuery()

  if (query.isPending) return <LoadingState variant="form" />
  if (query.isError || !query.data) {
    return (
      <ErrorState
        title="Deployment information could not be loaded"
        description="The backend build details did not load. Nothing has been changed."
        onRetry={() => void query.refetch()}
      />
    )
  }

  const { backend, mobileApps } = query.data

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4">
          {/* 1 / 2 / 4 columns — plan.md §6.2 stat-card behaviour. */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Backend version" value={backend.version} />
            <Stat
              label="Environment"
              value={backend.environment}
              /*
               * Coloured, because this strip exists to stop an operator
               * editing a release policy while looking at the wrong service.
               */
              tone={backend.environment === 'production' ? 'danger' : 'default'}
            />
            <Stat label="Node" value={backend.nodeVersion} />
            <Stat label="Uptime" value={formatUptime(backend.uptimeSeconds)} />
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-4 text-caption text-foreground-muted">
            <span className="inline-flex items-center gap-2">
              Commit
              <CopyableId value={backend.commitHash} maxLength={16} label="Commit" />
            </span>
            <span className="inline-flex items-center gap-1">
              Deployed <DateTime value={backend.deployedAt} className="text-caption" />
            </span>
          </div>
        </CardContent>
      </Card>

      {/*
       * ⚠️ Which clients these records actually reach (plan.md §3.1).
       *
       * Verified live 2026-09-28: this is a DIFFERENT record from the one mobile
       * clients read at cold start. Writing here changes nothing a phone is
       * told, and the save succeeds either way — so without this line an
       * operator setting a force update during an incident watches nothing
       * happen and has no way to find out why.
       *
       * ⚠️ **Hoisted out of `VersionPolicyForm`**, where it rendered once per
       * platform. Stacked that was merely repetitive; side by side it put the
       * same paragraph on screen twice, next to itself. It is a statement about
       * this screen, not about Android — so it belongs here, once, above both.
       */}
      <ReachNotice reach="versions" />

      {/*
       * Two independent forms, one per platform. The API takes one platform per
       * request, and pairing them behind a single save would mean a half-failed
       * write with no honest way to report which half.
       *
       * Side by side from `xl` up. They are the same form twice, and comparing
       * the two policies is the work this screen exists for — stacked, that
       * comparison needed a scroll. `xl` rather than `lg` because at 1024 the
       * sidebar is already showing, which would leave each form under 380px.
       *
       * `items-start` so a taller card does not stretch the shorter one, and
       * below `xl` they stack in source order exactly as before.
       */}
      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <VersionPolicyForm policy={mobileApps.android} canEdit={canEdit} />
        <VersionPolicyForm policy={mobileApps.ios} canEdit={canEdit} />
      </div>

      {!canEdit ? (
        <p className="text-caption text-foreground-muted">
          Your role can view release policies but not change them.
        </p>
      ) : null}
    </div>
  )
}
