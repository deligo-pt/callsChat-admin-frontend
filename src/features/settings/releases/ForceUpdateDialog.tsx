import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AppPlatform } from '@/types/settings'

/**
 * Confirmation for arming a forced update.
 *
 * `forceUpdate: true` tells every client below `minRequiredVersion` that it may
 * not be used until it is updated. There is no in-app way back from that — a
 * user on an old build cannot reach a screen to fix it — so the recovery is an
 * admin coming here and turning it off, which means the operator has to
 * understand the scale before they arm it, not after.
 *
 * Bespoke rather than `ConfirmActionDialog`, for the reason already established
 * by `SignOutAllDevicesCard` and `MaintenanceDialog`: the endpoint has no
 * reason field to carry a justification and no second party to attribute one
 * to. The gate this needs is proportional to *scale*, so it asks for the
 * platform name to be typed.
 */

export interface ForceUpdateDialogProps {
  open: boolean
  platform: AppPlatform
  latestVersion: string
  minRequiredVersion: string
  storeName: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function ForceUpdateDialog({
  open,
  platform,
  latestVersion,
  minRequiredVersion,
  storeName,
  onOpenChange,
  onConfirm,
}: ForceUpdateDialogProps) {
  const [typed, setTyped] = useState('')
  const confirmed = typed.trim().toUpperCase() === platform

  function change(next: boolean) {
    if (!next) setTyped('')
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-danger" aria-hidden="true" />
            Force {platform === 'ANDROID' ? 'Android' : 'iOS'} users to update?
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-left">
              <p>
                Anyone on a version below{' '}
                <span className="font-medium">{minRequiredVersion || '—'}</span> will be
                blocked from using the app until they install{' '}
                <span className="font-medium">{latestVersion || '—'}</span> from the{' '}
                {storeName}.
              </p>
              {/*
               * The recovery path, stated up front. A user on an old build has
               * no screen to fix this from, so the only way out is an admin
               * returning here.
               */}
              <p>
                They cannot dismiss it. Turning this back off is the only way to let
                them in again.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="force-update-confirm">Type {platform} to confirm</Label>
          <Input
            id="force-update-confirm"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => change(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={!confirmed}
            onClick={() => {
              onConfirm()
              change(false)
            }}
          >
            Arm forced update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
