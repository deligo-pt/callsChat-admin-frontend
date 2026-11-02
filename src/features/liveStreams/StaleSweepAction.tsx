import { Timer } from 'lucide-react'
import { useId, useState } from 'react'

import { ConfirmActionDialog } from '@/components/feedback'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCount } from '@/lib/format'

import { useReapStale } from './useLiveModeration'

/**
 * "Run stale-stream sweep" — `POST /admin/live/rooms/reap-stale`
 * (plan.md Live §5.3, L3).
 *
 * Ends every room whose host has been away for the threshold. The server
 * requires a whole number of at least 1 (measured from the validator); the
 * panel also caps it at a day, past which "stale" stops meaning anything.
 */

const DEFAULT_MINUTES = 5
const MAX_MINUTES = 1440

export function StaleSweepAction() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Timer /> Run stale-stream sweep
      </Button>
      {open ? <SweepDialog onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function SweepDialog({ onClose }: { onClose: () => void }) {
  const reap = useReapStale()
  const id = useId()
  const [minutes, setMinutes] = useState(String(DEFAULT_MINUTES))
  const value = Number(minutes.trim())
  const valid =
    minutes.trim() !== '' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_MINUTES

  return (
    <ConfirmActionDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title="Sweep stale streams"
      target="Every room on air whose host is away"
      effect={`Ends every room whose host has been disconnected for ${
        valid
          ? `${formatCount(value)} ${value === 1 ? 'minute' : 'minutes'}`
          : 'the time below'
      } or longer. Anyone still listening is disconnected, and the rooms move to Past streams. Rooms whose host is connected are not touched.`}
      severity="warning"
      reason="none"
      confirmLabel="Run the sweep"
      confirmDisabled={!valid}
      loading={reap.isPending}
      fields={
        <div className="space-y-2">
          <Label htmlFor={id}>Host away for at least (minutes)</Label>
          <Input
            id={id}
            inputMode="numeric"
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            className="sm:max-w-40"
            aria-invalid={!valid || undefined}
            aria-describedby={`${id}-hint`}
          />
          <p
            id={`${id}-hint`}
            role={valid ? undefined : 'alert'}
            className={
              valid
                ? 'text-caption text-foreground-muted'
                : 'text-caption text-danger-foreground'
            }
          >
            A whole number from 1 to {formatCount(MAX_MINUTES)}. Five minutes is the
            usual setting.
          </p>
        </div>
      }
      onConfirm={() => reap.mutate(value, { onSuccess: onClose })}
    />
  )
}
