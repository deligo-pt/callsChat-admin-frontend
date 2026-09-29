import { FlaskConical, TrendingDown, TrendingUp } from 'lucide-react'

import { PageHeader } from '@/components/display'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/cn'
import { TONE_CLASSES } from '@/lib/status'

import { DEMO_ACTIVITY, DEMO_SIGNUPS, DEMO_STATS, type DemoStat } from './demoData'

/**
 * The dashboard — **a preview, not a report**.
 *
 * `GET /admin/dashboard/snapshot`, `/trends` and `/admin/analytics` exist but
 * are not consumed yet, so every figure here comes from `demoData.ts`.
 *
 * It replaced a placeholder that read *"This module is delivered in Phase 9"* —
 * build-plan jargon on an operator's screen, naming a phase nobody outside the
 * project can interpret. A shaped preview says the same thing better: this is
 * what the page will be, and the notice at the top says the numbers are not
 * real yet.
 *
 * ⚠️ **The sample-data notice is not dismissible and not subtle.** A dashboard
 * is the screen most likely to be screenshotted into a meeting, and a
 * plausible number with no caveat is how a demo figure becomes a quoted one.
 */

function StatCard({ stat }: { stat: DemoStat }) {
  const Icon = stat.direction === 'down' ? TrendingDown : TrendingUp

  return (
    <Card className="min-w-0">
      <CardContent className="space-y-1">
        <p className="text-caption text-foreground-muted">{stat.label}</p>
        <p className="tabular text-h2">{stat.value}</p>
        <p className="flex items-center gap-1.5 text-caption">
          {stat.direction === 'flat' ? null : (
            <Icon
              className={cn(
                'size-3.5 shrink-0',
                stat.direction === 'up' ? 'text-success' : 'text-warning',
              )}
              aria-hidden="true"
            />
          )}
          <span className="text-foreground-muted">{stat.delta} on last week</span>
        </p>
        <p className="text-caption text-foreground-subtle">{stat.hint}</p>
      </CardContent>
    </Card>
  )
}

/**
 * A bar chart drawn with divs.
 *
 * No charting library for seven sample values — it would be a dependency the
 * real dashboard may not even want, chosen before anyone knows what the API
 * returns. The numbers are in the DOM as text for assistive tech; the bars are
 * decoration.
 */
function SignupsChart() {
  const peak = Math.max(...DEMO_SIGNUPS.map((point) => point.value))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-ups this week</CardTitle>
        <CardDescription>New accounts per day.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex h-44 gap-2">
          {DEMO_SIGNUPS.map((point) => (
            <li key={point.label} className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="text-center tabular text-caption text-foreground-muted">
                {point.value}
              </span>
              {/*
               * The bar's percentage height needs a parent with a resolved
               * height, which `flex-1` inside a fixed-height column provides.
               * Without it the percentage resolves against `auto` and every
               * bar collapses to nothing — which is exactly how this rendered
               * the first time.
               */}
              <div className="flex min-h-0 flex-1 items-end">
                <div
                  className="w-full rounded-t-sm bg-primary/80"
                  style={{ height: `${Math.round((point.value / peak) * 100)}%` }}
                  aria-hidden="true"
                />
              </div>
              <span className="text-center text-caption text-foreground-muted">
                {point.label}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function RecentActivity() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent admin activity</CardTitle>
        <CardDescription>What the team has changed lately.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {DEMO_ACTIVITY.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <span className="min-w-0 text-body">{entry.action}</span>
              <span className="flex shrink-0 items-center gap-2">
                {/*
                 * A role, never a name. An invented person on a demo screen
                 * gets mistaken for a real account, and someone goes looking.
                 */}
                <span
                  className={cn(
                    'rounded-sm px-2 py-0.5 text-overline uppercase',
                    entry.tone === 'neutral'
                      ? 'bg-surface-muted text-foreground-muted'
                      : TONE_CLASSES[entry.tone],
                  )}
                >
                  {entry.actor}
                </span>
                <span className="text-caption text-foreground-muted">{entry.when}</span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="How CallsChat is being used, at a glance."
        breadcrumbs={[{ label: 'Dashboard' }]}
      />

      {/*
       * Above everything, and worded as a fact rather than a warning. It is
       * the difference between a preview and a lie.
       */}
      <p className="flex items-start gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-caption text-foreground-muted">
        <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-medium text-foreground">
            Sample figures — none of these numbers are real.
          </span>{' '}
          This is a preview of the layout. Live data appears here once the dashboard API
          is connected.
        </span>
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {DEMO_STATS.map((stat) => (
          <StatCard key={stat.id} stat={stat} />
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <SignupsChart />
        <RecentActivity />
      </div>
    </div>
  )
}
