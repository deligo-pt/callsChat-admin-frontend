import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'
import type { DateRange } from 'react-day-picker'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/datetime'

import { DATE_RANGE_PRESETS } from './dateRangePresets'

export type { DateRange }

export interface DateRangePickerProps {
  value?: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
  /**
   * plan.md §Analytics: every filtered range states its timezone explicitly, so
   * two operators in different regions read the same report the same way.
   */
  timeZone?: string
  label?: string
  className?: string
}

export function DateRangePicker({
  value,
  onChange,
  timeZone = 'UTC',
  label = 'Date range',
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)

  /*
   * All four cases, including the end-only one.
   *
   * A range with a `to` and no `from` is legal — "everything before this
   * date" — and used to fall through to "All time", which told the operator
   * the opposite of what was applied. It is not reachable by clicking, but it
   * is reachable from a pasted URL wherever the range is URL-backed
   * (feedback_management_plan.md §3.7).
   */
  const display =
    value?.from && value.to
      ? `${formatDate(value.from, { timeZone })} – ${formatDate(value.to, { timeZone })}`
      : value?.from
        ? `${formatDate(value.from, { timeZone })} – …`
        : value?.to
          ? `… – ${formatDate(value.to, { timeZone })}`
          : 'All time'

  return (
    <div className={cn('space-y-1.5', className)}>
      <span className="block text-overline text-foreground-subtle uppercase">
        {label} <span className="normal-case">({timeZone})</span>
      </span>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-start font-normal lg:w-auto"
            aria-label={`${label}: ${display}, timezone ${timeZone}`}
          >
            <CalendarIcon />
            <span className="truncate">{display}</span>
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex flex-col sm:flex-row">
            {/* Presets — a row on mobile, a rail on desktop */}
            <div className="flex gap-1 overflow-x-auto border-b border-border p-2 sm:flex-col sm:border-r sm:border-b-0">
              {DATE_RANGE_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  variant="ghost"
                  size="sm"
                  className="justify-start whitespace-nowrap"
                  onClick={() => {
                    onChange(preset.resolve())
                    setOpen(false)
                  }}
                >
                  {preset.label}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="justify-start whitespace-nowrap"
                onClick={() => onChange(undefined)}
              >
                All time
              </Button>
            </div>

            <Calendar
              mode="range"
              selected={value}
              onSelect={onChange}
              numberOfMonths={1}
              autoFocus
              className="sm:[--cell-size:2.25rem]"
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
