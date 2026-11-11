import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatCount } from '@/lib/format'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
import type { DashboardTimeframe, TrendPoint } from '@/types/dashboard'

import { axisLabel, pointLabel, SERIES, type SeriesKey } from './activity'

/**
 * The Recharts part of the activity card (plan.md DB3, D6). Loaded lazily, so
 * Recharts stays out of the first bundle until the dashboard asks for it.
 *
 * Keyboard users can focus the chart and move through the points with the
 * arrow keys (Recharts' accessibility layer); the tooltip follows. Screen
 * readers get the chart's name and description from `title` / `desc`, and the
 * figures themselves from the table beside it (plan.md D6, DB5).
 */
export default function ActivityChart({
  points,
  timeframe,
  visible,
}: {
  points: readonly TrendPoint[]
  timeframe: DashboardTimeframe
  visible: ReadonlySet<SeriesKey>
}) {
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)')
  const shown = SERIES.filter((s) => visible.has(s.key))
  const allZero = points.every((p) => shown.every((s) => p[s.key] === 0))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={[...points]}
        margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
        accessibilityLayer
        title="Activity chart"
        desc="Use the left and right arrow keys to move between points. The same figures are in the table that follows."
      >
        <defs>
          {SERIES.map((s) => (
            <linearGradient
              key={s.key}
              id={`activity-${s.key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" style={{ stopColor: s.color, stopOpacity: 0.28 }} />
              <stop offset="100%" style={{ stopColor: s.color, stopOpacity: 0 }} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid
          vertical={false}
          stroke="var(--color-border)"
          strokeDasharray="3 3"
        />
        <XAxis
          dataKey="at"
          tickFormatter={(at: string) => axisLabel(at, timeframe)}
          tick={{ fill: 'var(--color-foreground-muted)', fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
          interval="preserveStartEnd"
        />
        <YAxis
          allowDecimals={false}
          /*
           * 'auto' rounds the top to a nice tick (500, not 492). An all-zero
           * period would collapse to 0–0, so it gets a fixed 0–4 scale.
           */
          domain={allZero ? [0, 4] : [0, 'auto']}
          tickFormatter={(value: number) => formatCount(value)}
          tick={{ fill: 'var(--color-foreground-muted)', fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip
          cursor={{ stroke: 'var(--color-border)', strokeWidth: 1 }}
          content={({ active, payload }) => {
            const point = payload?.[0]?.payload as TrendPoint | undefined
            return active && point ? (
              <ChartTooltip point={point} timeframe={timeframe} visible={visible} />
            ) : null
          }}
        />
        {shown.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            fill={`url(#activity-${s.key})`}
            activeDot={{ r: 4, strokeWidth: 0 }}
            dot={false}
            isAnimationActive={!reduce}
            animationDuration={700}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

function ChartTooltip({
  point,
  timeframe,
  visible,
}: {
  point: TrendPoint
  timeframe: DashboardTimeframe
  visible: ReadonlySet<SeriesKey>
}) {
  return (
    <div className="min-w-44 rounded-lg border border-border bg-card px-3 py-2 text-caption shadow-md">
      <p className="mb-1.5 font-medium text-foreground">
        {pointLabel(point.at, timeframe)}
      </p>
      <ul className="space-y-1">
        {SERIES.filter((s) => visible.has(s.key)).map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-foreground-muted">
              <span className={`size-2 rounded-full ${s.dot}`} />
              {s.label}
            </span>
            <span className="font-medium text-foreground tabular-nums">
              {formatCount(point[s.key])}
              {s.key === 'calls' ? (
                <span className="font-normal text-foreground-muted">
                  {' · '}
                  {formatCount(point.callMinutes)} min
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
