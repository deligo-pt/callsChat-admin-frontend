import { Clock, MessageSquare, PhoneCall, type LucideIcon } from 'lucide-react'
import type { CSSProperties } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { formatCount } from '@/lib/format'
import type { DashboardSnapshot } from '@/types/dashboard'

import { CountUp } from './CountUp'
import { DashboardSection } from './DashboardSection'
import { formatTalkTime } from './helpers'
import { IconBadge, type Tone } from './StatCard'

/**
 * All-time totals (plan.md DB4): calls connected, talk time and messages,
 * from the snapshot's `historicalTotals`. Talk time arrives in minutes and is
 * shown in hours once it is long enough to read better that way; the exact
 * minutes stay underneath.
 */
export function AllTimeCard({
  totals,
  loading,
  unavailable = false,
  className,
  style,
}: {
  totals: DashboardSnapshot['historicalTotals'] | undefined
  loading: boolean
  /** The snapshot failed with nothing to show (DB5); the page banner has Retry. */
  unavailable?: boolean | undefined
  className?: string | undefined
  style?: CSSProperties | undefined
}) {
  return (
    <DashboardSection
      title="All time"
      error={unavailable ? 'Not available right now.' : null}
      errorTone="muted"
      description="Since the platform started."
      loading={loading || !totals}
      skeleton={
        <div className="grid gap-4 sm:grid-cols-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      }
      className={className}
      style={style}
    >
      {totals ? (
        <ul className="grid h-full gap-3 sm:grid-cols-3">
          <Total
            icon={PhoneCall}
            tone="success"
            label="Calls connected"
            value={totals.totalCallsConnected}
            format={formatCount}
          />
          <Total
            icon={Clock}
            tone="primary"
            label="Talk time"
            value={totals.totalCallDurationMinutes}
            format={formatTalkTime}
            note={
              totals.totalCallDurationMinutes >= 120
                ? `${formatCount(totals.totalCallDurationMinutes)} minutes`
                : undefined
            }
          />
          <Total
            icon={MessageSquare}
            tone="accent"
            label="Messages sent"
            value={totals.totalMessagesSent}
            format={formatCount}
          />
        </ul>
      ) : null}
    </DashboardSection>
  )
}

function Total({
  icon,
  tone,
  label,
  value,
  format,
  note,
}: {
  icon: LucideIcon
  tone: Tone
  label: string
  value: number
  format: (value: number) => string
  note?: string | undefined
}) {
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-lg bg-surface-sunken p-4 sm:flex-col sm:items-start sm:justify-between">
      <IconBadge icon={icon} tone={tone} className="size-10 bg-card" />
      <div className="min-w-0">
        <p className="truncate text-caption text-foreground-muted">{label}</p>
        <div>
          <CountUp
            value={value}
            format={format}
            className="text-2xl leading-tight font-semibold tracking-tight text-foreground"
          />
          {note ? (
            <span className="block text-caption text-foreground-muted">{note}</span>
          ) : null}
        </div>
      </div>
    </li>
  )
}
