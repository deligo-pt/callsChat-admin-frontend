import type { DateRange } from 'react-day-picker'

export interface DateRangePreset {
  readonly id: string
  readonly label: string
  readonly resolve: () => DateRange
}

function startOfToday(): Date {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function daysAgo(days: number): Date {
  const date = startOfToday()
  date.setDate(date.getDate() - days)
  return date
}

/** plan.md §1C: today, 7d, 30d, MTD, custom. */
export const DATE_RANGE_PRESETS: readonly DateRangePreset[] = [
  {
    id: 'today',
    label: 'Today',
    resolve: () => ({ from: startOfToday(), to: new Date() }),
  },
  {
    id: '7d',
    label: 'Last 7 days',
    resolve: () => ({ from: daysAgo(6), to: new Date() }),
  },
  {
    id: '30d',
    label: 'Last 30 days',
    resolve: () => ({ from: daysAgo(29), to: new Date() }),
  },
  {
    id: 'mtd',
    label: 'Month to date',
    resolve: () => {
      const from = startOfToday()
      from.setDate(1)
      return { from, to: new Date() }
    },
  },
]
